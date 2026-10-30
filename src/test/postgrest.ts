import { createClient } from "@supabase/supabase-js";
import type { Db } from "./db";

/**
 * Just enough PostgREST (and Supabase Auth) over PGlite for the real
 * supabase-js client: the app's own queries run unchanged, as the signed-in
 * member, with RLS, grants and triggers as in production. Covers what src/
 * uses: embeds (to-one, to-many, !inner) with filters on them, eq/neq/gt/gte/
 * lt/lte/like/ilike/is/in/cs, not., or=(), json paths, order, limit, offset,
 * single, count, insert/upsert/update/delete with returning, and rpc.
 */

type Rel = { table: string; many: boolean; on: [string, string][] }; // on: [parentCol, childCol]
type Filter = { path: string[]; sql: (col: (c: string) => string, p: Params) => string };
type Node = { table: string; alias: string; star: boolean; cols: { name: string; expr: string }[]; embeds: Embed[] };
type Embed = Node & { rel: Rel; inner: boolean };

class Params {
  values: unknown[] = [];
  add(v: unknown) {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** `props->>event` → `"props"->>'event'` */
function colExpr(raw: string, table: string) {
  const [base, ...rest] = raw.split(/(->>?)/);
  let out = `${table}.${ident(base.trim())}`;
  for (let i = 0; i < rest.length; i += 2) out += `${rest[i]}'${rest[i + 1].replace(/'/g, "''")}'`;
  return out;
}

function splitTop(s: string, sep = ",") {
  const out: string[] = [];
  let depth = 0, cur = "", quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseList(v: string) {
  return splitTop(v.replace(/^\(|\)$/g, "")).map((x) => x.replace(/^"|"$/g, ""));
}

/** One `op.value` (possibly `not.op.value`) against a column expression. */
function condition(col: string, opValue: string, p: Params): string {
  if (opValue.startsWith("not.")) return `not (${condition(col, opValue.slice(4), p)})`;
  const dot = opValue.indexOf(".");
  const op = opValue.slice(0, dot), v = opValue.slice(dot + 1);
  const cmp: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
  if (op in cmp) return `${col} ${cmp[op]} ${p.add(v)}`;
  if (op === "like" || op === "ilike") return `${col} ${op} ${p.add(v.replace(/\*/g, "%"))}`;
  if (op === "is") return `${col} is ${v === "null" ? "null" : v === "true" ? "true" : v === "false" ? "false" : "unknown"}`;
  if (op === "in") return `${col} = any(${p.add(parseList(v))})`;
  if (op === "cs") return v.startsWith("{") ? `${col} @> ${p.add(v)}` : `${col} @> ${p.add(v)}::jsonb`;
  if (op === "ov") return `${col} && ${p.add(v)}`;
  throw new Error(`unsupported filter ${op}`);
}

function orExpr(body: string, col: (c: string) => string, p: Params, joiner: "or" | "and"): string {
  const parts = splitTop(body.replace(/^\(|\)$/g, "")).map((part) => {
    const m = /^(not\.)?(and|or)(\(.*\))$/.exec(part);
    if (m) return `${m[1] ? "not " : ""}(${orExpr(m[3], col, p, m[2] as "or" | "and")})`;
    const [c, ...rest] = part.split(".");
    return condition(col(c), rest.join("."), p);
  });
  return `(${parts.join(` ${joiner} `)})`;
}

export function postgrestFetch(db: Db) {
  let rels: { from_table: string; from_cols: string[]; to_table: string; to_cols: string[] }[] | null = null;
  // Inside a request the transaction holds PGlite's lock, so catalog lookups must go through it.
  let current: { query: Db["query"] } = db;
  const meta = <T>(sql: string, params: unknown[] = []) => current.query<T>(sql, params);
  const fns = new Map<string, { args: { name: string; type: string }[]; set: boolean; composite: boolean; void: boolean }>();

  async function relation(parent: string, name: string, hint?: string): Promise<Rel> {
    rels ??= (
      await meta<{ from_table: string; from_cols: string[]; to_table: string; to_cols: string[] }>(`
        select c.conrelid::regclass::text as from_table, c.confrelid::regclass::text as to_table,
          array(select attname::text from unnest(c.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by i) as from_cols,
          array(select attname::text from unnest(c.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by i) as to_cols
        from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)
    ).rows.map((r) => ({ ...r, from_table: r.from_table.replace(/^public\./, ""), to_table: r.to_table.replace(/^public\./, "") }));
    const toOne = rels.filter((r) => r.from_table === parent && r.to_table === name && (!hint || r.from_cols.includes(hint)));
    if (toOne.length === 1) return { table: name, many: false, on: toOne[0].from_cols.map((c, i) => [c, toOne[0].to_cols[i]]) };
    const toMany = rels.filter((r) => r.to_table === parent && r.from_table === name && (!hint || r.from_cols.includes(hint)));
    if (toMany.length === 1) return { table: name, many: true, on: toMany[0].to_cols.map((c, i) => [c, toMany[0].from_cols[i]]) };
    throw new Error(`no single relationship between ${parent} and ${name}`);
  }

  async function parseSelect(table: string, alias: string, select: string): Promise<Node> {
    const node: Node = { table, alias, star: false, cols: [], embeds: [] };
    for (const item of splitTop(select || "*")) {
      const m = /^(?:([\w]+):)?([\w]+)(?:!([\w]+))?(?:!([\w]+))?\((.*)\)$/s.exec(item);
      if (m) {
        const [, as, name, h1, h2, inside] = m;
        const flags = [h1, h2].filter(Boolean);
        const inner = flags.includes("inner");
        const hint = flags.find((f) => f !== "inner" && f !== "left");
        const sub = await parseSelect(name, as ?? name, inside);
        node.embeds.push({ ...sub, rel: await relation(table, name, hint), inner });
      } else if (item === "*") node.star = true;
      else {
        const [lhs, cast] = item.split("::");
        const am = /^(?:([\w]+):)?(.+)$/.exec(lhs)!;
        const expr = am[2];
        const name = am[1] ?? expr.split(/->>?/).pop()!.trim();
        node.cols.push({ name, expr: cast ? `${expr}::${cast}` : expr });
      }
    }
    return node;
  }

  /** `(select ... )` producing the node's rows as jsonb, correlated to `parent` when embedded. */
  function nodeSql(node: Node, depth: number, filters: Filter[], extras: Map<string, URLSearchParams>, p: Params, parent?: { alias: string; rel: Rel }) {
    const t = `t${depth}`;
    const path = pathOf(node, extras);
    const where: string[] = [];
    if (parent) for (const [pc, cc] of parent.rel.on) where.push(parent.rel.many ? `${t}.${ident(cc)} = ${parent.alias}.${ident(pc)}` : `${t}.${ident(cc)} = ${parent.alias}.${ident(pc)}`);
    for (const f of filters) if (sameP(f.path, path)) where.push(f.sql((c) => colExpr(c, t), p));
    const own = extras.get(path.join(".")) ?? new URLSearchParams();
    if (own.get("or")) where.push(orExpr(own.get("or")!, (c) => colExpr(c, t), p, "or"));

    const embedCols: string[] = [];
    const innerConds: string[] = [];
    node.embeds.forEach((e, i) => {
      const key = `__e${i}`;
      embedCols.push(`${nodeSql(e, depth + 1, filters, extras, p, { alias: t, rel: e.rel })} as ${key}`);
      if (e.inner) innerConds.push(e.rel.many ? `q.${key} <> '[]'::jsonb` : `q.${key} is not null`);
      else if (!e.rel.many && filters.some((f) => sameP(f.path, [...path, e.alias]))) {
        // A filtered to-one embed without !inner still keeps the parent, with null.
      }
    });
    const proj: string[] = [];
    if (node.star) proj.push(`(to_jsonb(q) - array[${node.embeds.map((_, i) => `'__e${i}'`).concat("'__x'").join(",")}]::text[])`);
    const pairs = node.cols.map((c, i) => `'${c.name}', q.__c${i}`).concat(node.embeds.map((e, i) => `'${e.alias}', q.__e${i}`));
    for (let i = 0; i < pairs.length; i += 40) proj.push(`jsonb_build_object(${pairs.slice(i, i + 40).join(", ")})`);
    const projection = proj.length ? proj.join(" || ") : "'{}'::jsonb";
    const colSql = [node.star ? `${t}.*` : `null as __x`, ...node.cols.map((c, i) => `${colExpr(c.expr.split("::")[0], t)}${c.expr.includes("::") ? `::${c.expr.split("::")[1]}` : ""} as __c${i}`), ...embedCols];

    const order = orderSql(own.get("order"), t);
    const limit = own.get("limit") ? ` limit ${Number(own.get("limit"))}` : "";
    const offset = own.get("offset") ? ` offset ${Number(own.get("offset"))}` : "";
    const inner = `select ${colSql.join(", ")} from public.${ident(node.table)} ${t}${where.length ? ` where ${where.join(" and ")}` : ""}${order}`;
    const outerWhere = innerConds.length ? ` where ${innerConds.join(" and ")}` : "";
    if (!parent) return { inner, projection, outerWhere, limit: limit + offset };
    if (parent.rel.many) return `coalesce((select jsonb_agg(${projection}) from (${inner}${limit}${offset}) q${outerWhere}), '[]'::jsonb)`;
    return `(select ${projection} from (${inner} limit 1) q${outerWhere})`;
  }

  const sameP = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const paths = new WeakMap<Node, string[]>();
  const pathOf = (n: Node, _e: Map<string, URLSearchParams>) => paths.get(n) ?? []; // eslint-disable-line @typescript-eslint/no-unused-vars

  function setPaths(n: Node, path: string[]) {
    paths.set(n, path);
    for (const e of n.embeds) setPaths(e, [...path, e.alias]);
  }

  function orderSql(order: string | null, t: string) {
    if (!order) return "";
    return ` order by ${order.split(",").map((o) => {
      const [c, ...mods] = o.split(".");
      return `${colExpr(c, t)}${mods.includes("desc") ? " desc" : ""}${mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : ""}`;
    }).join(", ")}`;
  }

  async function readQuery(table: string, url: URL, p: Params) {
    const node = await parseSelect(table, table, url.searchParams.get("select") ?? "*");
    setPaths(node, []);
    const filters: Filter[] = [];
    const extras = new Map<string, URLSearchParams>();
    for (const [k, v] of url.searchParams) {
      if (["select", "columns", "on_conflict"].includes(k)) continue;
      const parts = k.split(".");
      const last = parts[parts.length - 1];
      if (["order", "limit", "offset", "or", "and"].includes(last)) {
        const key = parts.slice(0, -1).join(".");
        if (!extras.has(key)) extras.set(key, new URLSearchParams());
        extras.get(key)!.set(last, v);
        continue;
      }
      // `a.b.col=op.v`: the column is the last segment unless it carries a json path
      const colAt = parts.findIndex((x) => x.includes("->"));
      const split = colAt >= 0 ? colAt : parts.length - 1;
      const path = parts.slice(0, split);
      const col = parts.slice(split).join(".");
      filters.push({ path, sql: (c, pp) => condition(c(col), v, pp) });
    }
    const top = nodeSql(node, 0, filters, extras, p) as { inner: string; projection: string; outerWhere: string; limit: string };
    return { node, filters, extras, top };
  }

  async function asRole<T>(token: string | null, fn: (q: (sql: string, params?: unknown[]) => Promise<T[]>) => Promise<unknown>) {
    const claims = token ? decode(token) : { role: "anon" };
    return db.transaction(async (tx) => {
      current = tx;
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.exec(`set local role ${claims.role === "service_role" ? "service_role" : claims.role === "authenticated" ? "authenticated" : "anon"}`);
      return fn(async (sql, params = []) => (await tx.query<T>(sql, params)).rows);
    }).finally(() => {
      current = db;
    });
  }

  async function rest(req: Request, url: URL) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "") || null;
    const prefer = req.headers.get("prefer") ?? "";
    const single = (req.headers.get("accept") ?? "").includes("vnd.pgrst.object");
    const wantCount = /count=(exact|planned|estimated)/.test(prefer);
    const ret = prefer.includes("return=representation");
    const name = url.pathname.replace(/^\/rest\/v1\//, "");
    const method = req.method;
    const body = method === "GET" || method === "HEAD" ? undefined : await req.text();
    const p = new Params();

    let rows: unknown[] = [];
    let count: number | null = null;
    const run = await asRole<{ j: unknown; n?: number }>(token, async (q) => {
      if (name.startsWith("rpc/")) {
        const fn = name.slice(4);
        const meta = await fnMeta(fn);
        const args = body ? JSON.parse(body) : Object.fromEntries(url.searchParams);
        const call = `public.${ident(fn)}(${meta.args.filter((a) => a.name in args).map((a) => `${ident(a.name)} => ${p.add(a.type.includes("json") ? JSON.stringify(args[a.name]) : args[a.name])}::${a.type}`).join(", ")})`;
        if (meta.void) {
          await q(`select ${call}`, p.values);
          rows = [];
          return null;
        }
        if (meta.set || meta.composite) {
          const r = await q(`select to_jsonb(r) as j from ${call} r`, p.values);
          rows = r.map((x) => x.j);
          return meta.set ? "array" : "object";
        }
        const r = await q(`select to_jsonb(${call}) as j`, p.values);
        rows = r.map((x) => x.j);
        return "scalar";
      }

      if (method === "GET" || method === "HEAD") {
        const { top } = await readQuery(name, url, p);
        const base = `select ${top.projection} as j from (${top.inner}) q${top.outerWhere}`;
        rows = (await q(`${base}${top.limit}`, p.values)).map((r) => r.j);
        if (wantCount) count = Number((await q(`select count(*)::int as n from (${base}) c`, p.values))[0].n);
        return "array";
      }

      const t = ident(name);
      const conds: string[] = [];
      for (const [k, v] of url.searchParams) {
        if (["select", "columns", "on_conflict", "order", "limit", "offset"].includes(k)) continue;
        conds.push(k === "or" ? orExpr(v, (c) => colExpr(c, `public.${t}`), p, "or") : condition(colExpr(k, `public.${t}`), v, p));
      }
      const where = conds.join(" and ") || "true";
      let dml: string;
      if (method === "POST") {
        const data = JSON.parse(body!);
        const list = Array.isArray(data) ? data : [data];
        const cols = url.searchParams.get("columns")?.split(",").map((c) => c.replace(/"/g, "")) ?? [...new Set(list.flatMap((r) => Object.keys(r)))];
        const payload = p.add(JSON.stringify(list));
        const colList = cols.map(ident).join(", ");
        dml = `insert into public.${t} (${colList}) select ${colList} from jsonb_populate_recordset(null::public.${t}, ${payload}::jsonb)`;
        if (prefer.includes("resolution=")) {
          const onConflict = url.searchParams.get("on_conflict") ?? (await primaryKey(name)).join(",");
          dml += prefer.includes("ignore-duplicates")
            ? ` on conflict (${onConflict}) do nothing`
            : ` on conflict (${onConflict}) do update set ${cols.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`;
        }
      } else if (method === "PATCH") {
        const data = JSON.parse(body!);
        const payload = p.add(JSON.stringify(data));
        dml = `update public.${t} set ${Object.keys(data).map((c) => `${ident(c)} = r__.${ident(c)}`).join(", ")} from jsonb_populate_record(null::public.${t}, ${payload}::jsonb) r__ where ${where}`;
      } else if (method === "DELETE") {
        dml = `delete from public.${t} where ${where}`;
      } else throw new Error(`unsupported ${method}`);

      if (!ret) {
        const r = await q(`with w as (${dml} returning 1) select count(*)::int as n from w`, p.values);
        count = wantCount ? Number(r[0].n) : null;
        rows = [];
        return "array";
      }
      // Project the written rows straight from RETURNING (a CTE can't see its own new rows).
      const node = await parseSelect(name, name, url.searchParams.get("select") ?? "*");
      setPaths(node, []);
      const needed = node.star ? `public.${t}.*` : [...new Set([...node.cols.map((c) => c.expr.split(/->|::/)[0].trim()), ...node.embeds.flatMap((e) => e.rel.on.map(([pc]) => pc))])].map((c) => `public.${t}.${ident(c)}`).join(", ") || "1 as __none";
      const sub = nodeSql(node, 0, [], new Map(), p) as { inner: string; projection: string; outerWhere: string };
      const written = `with w as (${dml} returning ${needed}) `;
      const filtered = sub.inner.replace(` from public.${t} t0`, ` from w t0`);
      rows = (await q(`${written}select ${sub.projection} as j from (${filtered}) q`, p.values)).map((r) => r.j);
      return "array";
    }).catch((e: { code?: string; message: string; detail?: string; hint?: string }) => ({ error: e }));

    if (run && typeof run === "object" && "error" in run) {
      const e = run.error as { code?: string; message: string; detail?: string; hint?: string };
      const status = e.code === "42501" ? (token ? 403 : 401) : e.code === "23505" ? 409 : e.code?.startsWith("23") ? 409 : e.code === "P0002" ? 404 : 400;
      return json({ code: e.code ?? "PGRST000", message: e.message, details: e.detail ?? null, hint: e.hint ?? null }, status);
    }
    const headers: Record<string, string> = {};
    if (count !== null || wantCount) headers["content-range"] = `${rows.length ? `0-${rows.length - 1}` : "*"}/${count ?? rows.length}`;
    if (single) {
      if (rows.length !== 1) return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null }, 406);
      return json(rows[0], 200, headers);
    }
    if (run === "scalar" || run === "object") return json(rows[0] ?? null, 200, headers);
    if (run === null) return new Response(null, { status: 204 });
    if (method === "HEAD") return new Response(null, { status: 200, headers });
    if (method !== "GET" && !name.startsWith("rpc/") && !ret) return new Response(null, { status: method === "POST" ? 201 : 204, headers });
    return json(rows, method === "POST" && !name.startsWith("rpc/") ? 201 : 200, headers);
  }

  async function fnMeta(fn: string) {
    if (!fns.has(fn)) {
      const { rows } = await meta<{ names: string[] | null; types: string[]; set: boolean; typtype: string; rettype: string }>(`
        select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) t) as types,
          p.proretset as set, ty.typtype, format_type(p.prorettype, null) as rettype
        from pg_proc p join pg_type ty on ty.oid = p.prorettype where p.proname = $1 and p.pronamespace = 'public'::regnamespace`, [fn]);
      const r = rows[0];
      if (!r) throw new Error(`no function ${fn}`);
      fns.set(fn, { args: r.types.map((type, i) => ({ name: r.names?.[i] ?? `$${i + 1}`, type })), set: r.set, composite: r.typtype === "c", void: r.rettype === "void" });
    }
    return fns.get(fn)!;
  }

  const pks = new Map<string, string[]>();
  async function primaryKey(table: string) {
    if (!pks.has(table)) {
      const { rows } = await meta<{ a: string }>(`
        select a.attname as a from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = ('public.' || $1)::regclass and i.indisprimary`, [table]);
      pks.set(table, rows.map((r) => r.a));
    }
    return pks.get(table)!;
  }

  async function auth(req: Request, url: URL) {
    const path = url.pathname.replace(/^\/auth\/v1/, "");
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (path === "/user" && req.method === "GET") {
      const c = decode(token);
      if (!c.sub) return json({ code: 401, msg: "invalid JWT" }, 401);
      const { rows } = await db.query<{ email: string; created_at: string }>(`select email, created_at from auth.users where id = $1`, [c.sub]);
      if (!rows[0]) return json({ code: 404, msg: "User not found" }, 404);
      return json({ id: c.sub, aud: "authenticated", role: "authenticated", email: rows[0].email, app_metadata: {}, user_metadata: {}, created_at: rows[0].created_at });
    }
    if (path === "/admin/users" && req.method === "POST") {
      const b = JSON.parse(await req.text());
      const exists = await db.query(`select 1 from auth.users where email = $1`, [b.email]);
      if (exists.rows.length) return json({ code: 422, error_code: "email_exists", msg: "A user with this email address has already been registered" }, 422);
      const { rows } = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [b.email]);
      return json({ id: rows[0].id, email: b.email, aud: "authenticated", app_metadata: {}, user_metadata: {} });
    }
    const del = /^\/admin\/users\/([\w-]+)$/.exec(path);
    if (del && req.method === "DELETE") {
      await db.query(`delete from auth.users where id = $1`, [del[1]]);
      return json({});
    }
    return json({ msg: `auth ${req.method} ${path} not stubbed` }, 501);
  }

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.pathname.startsWith("/rest/v1/")) return rest(req, url);
    if (url.pathname.startsWith("/auth/v1/")) return auth(req, url);
    return json({ message: `not stubbed: ${url.pathname}` }, 501);
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function decode(token: string): { sub?: string; role?: string; email?: string } {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    return { role: "anon" };
  }
}

export const TEST_URL = "http://supabase.test";

export function jwt(claims: { sub?: string; role: string; email?: string }) {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256", typ: "JWT" })}.${b({ aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), ...claims })}.sig`;
}

export const SERVICE_KEY = jwt({ role: "service_role" });
export const ANON_KEY = jwt({ role: "anon" });

/** A real supabase-js client wired to the in-process database, as `userId` (or the service role when omitted). */
export function testClient(db: Db, userId?: string) {
  const fetch = postgrestFetch(db);
  const key = userId ? ANON_KEY : SERVICE_KEY;
  const headers = userId ? { Authorization: `Bearer ${jwt({ sub: userId, role: "authenticated" })}` } : undefined;
  return createClient(TEST_URL, key, { global: { fetch, headers }, auth: { persistSession: false, autoRefreshToken: false, storageKey: `test-${crypto.randomUUID()}` } });
}
