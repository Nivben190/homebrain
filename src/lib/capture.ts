// "Hey Siri, Brain add milk": decide which space a spoken item goes to.

export interface CaptureSpace {
  id: string;
  title: string;
  template: string | null;
  view: string;
}

const FOOD = /\b(milk|bread|eggs?|cheese|butter|yogh?urt|apples?|bananas?|tomato(es)?|cucumbers?|onions?|rice|pasta|coffee|tea|sugar|flour|chicken|meat|fish|water|juice|snacks?)\b|חלב|לחם|ביצים|גבינה|חמאה|יוגורט|תפוח|בננ|עגבני|מלפפו|בצל|אורז|פסטה|קפה|תה|סוכר|קמח|עוף|בשר|דג|מים|מיץ|חטיפ|קוטג|במבה/i;

const COMMIT = /^(i\s+)?commit(ment)?\b|^אני מתחייב|^מתחייב|^התחייבות/i;

/** Views an item can sensibly be dropped into by voice. */
const ADDABLE = new Set(["list", "checklist", "notes"]);

/**
 * Picks the space: an explicit one (id or name) always wins; "milk to Shopping"
 * / "חלב לקניות" names one at the end; food words go to the groceries list;
 * otherwise the first list. Returns the cleaned item text too.
 */
export function routeCapture<S extends CaptureSpace>(raw: string, spaces: S[], explicit?: string | null): { space: S | null; text: string } {
  let text = raw.trim().replace(/[.!]+$/, "");
  const norm = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase();
  const byName = (name: string) => spaces.find((s) => s.id === name || norm(s.title) === norm(name) || norm(s.title).startsWith(norm(name)));

  if (explicit) {
    const s = byName(explicit);
    if (s) return { space: s, text };
  }
  // "I commit to…" / "אני מתחייב ל…" goes to the Commitments space.
  if (COMMIT.test(text)) {
    const c = spaces.find((s) => s.view === "commit");
    if (c) return { space: c, text };
  }
  const tail = text.match(/^(.+?)\s+(?:to|in|into|on)\s+(?:the\s+|my\s+)?(.+)$/i) ?? text.match(/^(.+?)\s+ל(?:רשימת\s+)?(\S.*)$/);
  if (tail) {
    const s = byName(tail[2]);
    if (s) return { space: s, text: tail[1].trim() };
  }
  const addable = spaces.filter((s) => ADDABLE.has(s.view));
  if (FOOD.test(text)) {
    const g = addable.find((s) => s.template === "groceries");
    if (g) return { space: g, text };
  }
  text = text.replace(/^(add|תוסיף|תוסיפי|להוסיף)\s+/i, "");
  return { space: addable[0] ?? null, text };
}
