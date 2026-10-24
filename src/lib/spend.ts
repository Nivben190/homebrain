// Spending: purchase texts from Max / Leumi, forwarded by an iPhone automation.
// Each purchase is an item in a Spending space with its details in props._tx.
import { createHash } from "node:crypto";
import { zonedParts } from "./engine/time";

export const TX_PROP = "_tx";

export const CATEGORIES = ["groceries", "eating", "fuel", "transport", "subscriptions", "home", "health", "shopping", "pets", "bills", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Tx {
  amount: number;
  currency: string;
  merchant: string;
  card?: string;
  at: string;
  category: Category;
  refund: boolean;
  /** Same text forwarded twice (both phones, a retry) is one purchase. */
  key: string;
}

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const CUR = String.raw`(ש"ח|ש״ח|שח|₪|NIS|ILS|שקל(?:ים)?|\$|USD|€|EUR)`;
const AMOUNT_AFTER = new RegExp(`${NUM}\\s?${CUR}`, "i");
const AMOUNT_BEFORE = new RegExp(`(₪|\\$|€)\\s?${NUM}`);
const NOT_A_PURCHASE = /קוד|סיסמ|code|password|otp/i;
const REFUND = /זיכוי|ביטול|החזר|refund|credit(ed)?\b|reversal/i;
const CARD = /(?:המסתיים|המסתיימת|ending(?:\s+in)?|כרטיס(?:ך)?(?:\s+מספר)?|card|חשבון(?:ך)?)\D{0,6}(\d{4})\b/i;

const currencyOf = (c: string) => (/\$|usd/i.test(c) ? "$" : /€|eur/i.test(c) ? "€" : "₪");

/** Reads a purchase text, or null when it's something else (codes, statements). */
export function parseSpendSms(text: string): Omit<Tx, "at" | "category" | "key"> | null {
  if (NOT_A_PURCHASE.test(text)) return null;
  const after = text.match(AMOUNT_AFTER);
  const before = text.match(AMOUNT_BEFORE);
  const m = after && (!before || after.index! <= before.index!) ? { num: after[1], cur: after[2], index: after.index!, len: after[0].length } : before ? { num: before[2], cur: before[1], index: before.index!, len: before[0].length } : null;
  if (!m) return null;
  const amount = Number(m.num.replace(/,/g, ""));
  if (!amount) return null;

  const rest = text.slice(m.index + m.len);
  const stop = String.raw`(?=\s+(?:was|on|has|בתאריך|בכרטיס|אושרה|בוצעה)\b|\s+(?:was|on)\s|[,\n]|\.(?:\s|$)|$)`;
  const merchant =
    text.match(new RegExp(String.raw`בבית העסק:?\s*(.+?)${stop}`))?.[1] ??
    text.match(new RegExp(String.raw`\bat\s+(.+?)${stop}`, "i"))?.[1] ??
    rest.match(new RegExp(String.raw`^\s*ב-?(\S.*?)${stop}`))?.[1] ??
    "";
  return { amount, currency: currencyOf(m.cur), merchant: merchant.trim().replace(/[.!]+$/, ""), card: text.match(CARD)?.[1], refund: REFUND.test(text) };
}

const RULES: [RegExp, Category][] = [
  [/super.?pharm|סופר.?פארם/i, "health"],
  [/cibus|pluxee|סיבוס|פלוקסי|10bis|תן ביס|wolt|וולט|מסעד|restaurant|cafe|קפה|aroma|ארומה|pizza|פיצ|mcdonald|מקדונלד|burger|בורגר|סושי|sushi/i, "eating"],
  [/שופרסל|shufersal|רמי לוי|rami levy|ויקטורי|victory|יוחננוף|yochananof|מגה|mega|טיב טעם|tiv taam|אושר עד|osher ad|קרפור|carrefour|am:pm|ampm|חצי חינם|יינות ביתן|סופר|super/i, "groceries"],
  [/paz|פז|sonol|סונול|delek|דלק|dor alon|דור אלון|ten\b|yellow|fuel/i, "fuel"],
  [/רב.?קו|rav.?kav|gett|גט|yango|יאנגו|uber|moovit|מוביט|רכבת|train|parking|חניה|פנגו|pango|cellopark|סלופארק/i, "transport"],
  [/netflix|spotify|apple\.com|itunes|google|youtube|disney|amazon prime|chatgpt|openai|icloud|hbo|yes\b|hot\b|partner|פרטנר|cellcom|סלקום|הוט/i, "subscriptions"],
  [/ikea|איקאה|ace|אייס|home center|הום סנטר|ביתילי|max stock|מקס סטוק/i, "home"],
  [/super.?pharm|סופר.?פארם|be\b|pharm|פארם|מכבי|כללית|maccabi|clalit|רופא|dent|שיניים/i, "health"],
  [/pet|חיות|ניסים פט|vet|וטרינר/i, "pets"],
  [/חשמל|electric|מים|water|ארנונה|arnona|גז|gas|ביטוח|insurance/i, "bills"],
  [/zara|זארה|h&m|castro|קסטרו|fox|פוקס|aliexpress|shein|amazon|terminal x|טרמינל/i, "shopping"],
];

export const categorize = (merchant: string): Category => RULES.find(([re]) => re.test(merchant))?.[1] ?? "other";

export const spendKey = (text: string) => createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 24);

export interface SpendSpace {
  id: string;
  owner_id: string | null;
  settings?: { cards?: string[] } | null;
}

/** The space that lists this card; otherwise the shared one (or any). */
export function pickSpendSpace<S extends SpendSpace>(spaces: S[], card: string | undefined): S | null {
  return (card && spaces.find((s) => s.settings?.cards?.includes(card))) || spaces.find((s) => !s.owner_id) || spaces[0] || null;
}

export function readTx(props: Record<string, unknown>): Tx | null {
  const t = props[TX_PROP] as Tx | undefined;
  return t && typeof t.amount === "number" && typeof t.at === "string" ? t : null;
}

/** "2026-10" in the household's time zone. */
export const monthOf = (iso: string, timeZone: string) => {
  const p = zonedParts(new Date(iso), timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
};

export const signed = (t: Tx) => (t.refund ? -t.amount : t.amount);

export function summarizeMonth(txs: Tx[], month: string, timeZone: string) {
  const inMonth = txs.filter((t) => t.currency === "₪" && monthOf(t.at, timeZone) === month);
  const by = new Map<Category, number>();
  for (const t of inMonth) by.set(t.category, (by.get(t.category) ?? 0) + signed(t));
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    total: round(inMonth.reduce((s, t) => s + signed(t), 0)),
    count: inMonth.length,
    byCategory: [...by].map(([category, amount]) => ({ category, amount: round(amount) })).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category)),
  };
}

const ALIASES = [["cibus", "סיבוס", "pluxee", "פלוקסי"], ["wolt", "וולט"], ["10bis", "תן ביס", "תןביס"], ["shufersal", "שופרסל"], ["netflix", "נטפליקס"], ["amazon", "אמזון"], ["aliexpress", "עליאקספרס"]];
const STOP = new Set(["no", "not", "more", "than", "under", "less", "max", "maximum", "most", "up", "to", "at", "on", "in", "the", "this", "month", "week", "year", "day", "today", "shekel", "shekels", "nis", "ils", "spend", "spending", "commit", "i", "a", "an", "and", "of", "for", "עד", "לא", "יותר", "פחות", "מקסימום", "שקל", "שקלים", "החודש", "השבוע", "השנה", "היום", "על", "אני", "מתחייב", "מתחייבת", "להוציא"]);

/** A limit commitment counts a purchase when a word of its title names the merchant ("Cibus" → CIBUS PLUXEE). */
export function matchesCommit(title: string, merchant: string): boolean {
  const m = merchant.toLowerCase();
  const words = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w) && !/^מ?-?\d/.test(w));
  return words.some((w) => {
    const forms = [w, ...(/^[בלמוה][֐-׿]{3,}/.test(w) ? [w.slice(1)] : [])].filter((f) => f.length >= 3 && !STOP.has(f));
    return forms.some((f) => {
      const group = ALIASES.find((g) => g.includes(f)) ?? [f];
      return group.some((a) => m.includes(a));
    });
  });
}
