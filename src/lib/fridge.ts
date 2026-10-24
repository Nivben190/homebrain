// Smart fridge: a photo of the fridge becomes an inventory. Each product is an
// item in a Fridge space with its state in props._fridge. Staples ("always have
// milk") that run low or out are what to buy.

export const FRIDGE_PROP = "_fridge";

export const LEVELS = ["full", "half", "low", "out"] as const;
export type Level = (typeof LEVELS)[number];

export interface FridgeState {
  level: Level;
  /** How many were seen (2 yogurts), when countable. */
  qty?: number;
  emoji?: string;
  /** Something we always want; running low puts it on the shopping list. */
  staple: boolean;
  /** Last time a scan saw it. */
  seen?: string;
}

/** What the camera saw: one line per product. */
export interface Seen {
  name: string;
  level: Level;
  qty?: number;
  emoji?: string;
}

export function readFridge(props: Record<string, unknown>): FridgeState | null {
  const f = props[FRIDGE_PROP] as FridgeState | undefined;
  return f && LEVELS.includes(f.level) ? f : null;
}

export const fridgeProps = (props: Record<string, unknown>, f: FridgeState) => ({ ...props, [FRIDGE_PROP]: f });

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(es|s)$/, "");

/** Same product under a slightly different name ("Eggs" / "egg", "חלב 3%" / "חלב"). */
export function sameProduct(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.split(" ").some((w) => w === short || w.replace(/(es|s)$/, "") === short);
}

export interface InventoryRow {
  id: string;
  title: string;
  props: Record<string, unknown>;
}

export interface ScanPlan {
  update: { id: string; props: Record<string, unknown> }[];
  insert: { title: string; props: Record<string, unknown> }[];
  /** Staples that are low or out after this scan. */
  missing: string[];
}

/**
 * Folds a scan into the inventory: seen products get their new level, new ones
 * are added, and anything the camera didn't see is out (it was eaten or used).
 */
export function planScan(rows: InventoryRow[], seen: Seen[], now: Date): ScanPlan {
  const at = now.toISOString();
  const update: ScanPlan["update"] = [];
  const insert: ScanPlan["insert"] = [];
  const matched = new Set<string>();

  for (const s of seen) {
    const row = rows.find((r) => !matched.has(r.id) && sameProduct(r.title, s.name));
    if (row) {
      matched.add(row.id);
      const prev = readFridge(row.props) ?? { level: "full", staple: false };
      update.push({ id: row.id, props: fridgeProps(row.props, { ...prev, level: s.level, qty: s.qty, emoji: s.emoji ?? prev.emoji, seen: at }) });
    } else if (!insert.some((i) => sameProduct(i.title, s.name))) {
      insert.push({ title: s.name, props: { [FRIDGE_PROP]: { level: s.level, qty: s.qty, emoji: s.emoji, staple: false, seen: at } satisfies FridgeState } });
    }
  }

  for (const r of rows) {
    if (matched.has(r.id)) continue;
    const prev = readFridge(r.props);
    if (prev && prev.level !== "out") update.push({ id: r.id, props: fridgeProps(r.props, { ...prev, level: "out", qty: 0 }) });
  }

  const after = new Map(rows.map((r) => [r.id, readFridge(r.props)]));
  for (const u of update) after.set(u.id, readFridge(u.props));
  const missing = rows.filter((r) => {
    const f = after.get(r.id);
    return f?.staple && (f.level === "low" || f.level === "out");
  });
  return { update, insert, missing: missing.map((r) => r.title) };
}

/** Shopping-list titles not already on the list. */
export function toBuy(missing: string[], onList: string[]): string[] {
  return missing.filter((m) => !onList.some((l) => sameProduct(l, m)));
}

/** Reads the model's answer: a JSON array somewhere in the text. Drops anything malformed. */
export function parseSeen(text: string): Seen[] {
  const json = text.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown[];
    return raw
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        name: String(x.name ?? "").trim().slice(0, 60),
        level: (LEVELS as readonly string[]).includes(String(x.level)) ? (x.level as Level) : "full",
        qty: typeof x.qty === "number" && x.qty > 0 ? Math.round(x.qty) : undefined,
        emoji: typeof x.emoji === "string" ? x.emoji.slice(0, 4) : undefined,
      }))
      .filter((s) => s.name && s.level !== "out");
  } catch {
    return [];
  }
}
