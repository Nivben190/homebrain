// A stand-in Supabase for browser tests with no account: the migrated
// in-memory database behind the same PostgREST/Auth/Storage shim the unit
// tests use, served over HTTP. Nothing reaches the real project.
//
//   node node_modules/jiti/lib/jiti-cli.mjs e2e/fake-supabase.ts
//
// POST /__test/home {"roles":["owner","adult"]} makes a fresh home and returns
// its members' emails; everyone's password is "password".
import http from "node:http";
import { migratedDb, seedHome } from "../src/test/db";
import { ANON_KEY, postgrestFetch } from "../src/test/postgrest";

export const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54329);
export { ANON_KEY };

const NAMES: Record<string, [string, string]> = { owner: ["Noa", "🦊"], adult: ["Dan", "🐻"], teen: ["Maya", "🐼"], child: ["Tom", "🐯"], guest: ["Gil", "🐨"] };

async function main() {
  const db = await migratedDb();
  const handle = postgrestFetch(db);

  const server = http.createServer(async (req, res) => {
    const cors = {
      "access-control-allow-origin": req.headers.origin ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-expose-headers": "content-range, content-profile",
    };
    if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    try {
      if (url.pathname === "/__test/health") return res.writeHead(200, cors).end("ok");
      if (url.pathname === "/__test/home" && req.method === "POST") {
        const { roles = ["owner"] } = body.length ? JSON.parse(body.toString()) : {};
        const home = await seedHome(db, roles);
        const people: Record<string, { id: string; email: string; password: string }> = {};
        for (const [role, id] of Object.entries(home.users)) {
          const [name, emoji] = NAMES[role] ?? [role, "🙂"];
          const { rows } = await db.query<{ email: string }>(`update auth.users set email = $2 where id = $1 returning email`, [id, `${role}-${id.slice(0, 8)}@e2e.test`]);
          await db.query(`update profiles set display_name = $2, emoji = $3, locale = 'en' where user_id = $1`, [id, name, emoji]);
          people[role] = { id, email: rows[0].email, password: "password" };
        }
        return res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ householdId: home.householdId, people }));
      }
      if (url.pathname === "/__test/sql" && req.method === "POST") {
        const { text, params = [] } = JSON.parse(body.toString());
        const { rows } = await db.query(text, params);
        return res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify(rows));
      }
      // Sign-out and refresh: enough for the browser client to carry on.
      if (url.pathname === "/auth/v1/logout") return res.writeHead(204, cors).end();

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      const reply = await handle(url.toString(), { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : body });
      const out: Record<string, string> = { ...cors };
      reply.headers.forEach((v, k) => (out[k] = v));
      res.writeHead(reply.status, out).end(Buffer.from(await reply.arrayBuffer()));
    } catch (e) {
      console.error("[fake-supabase]", req.method, req.url, e);
      res.writeHead(500, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ message: String(e) }));
    }
  });
  // Realtime can't connect here; the app carries on without live updates.
  server.listen(PORT, () => console.log(`fake supabase on http://localhost:${PORT}`));
}

void main();
