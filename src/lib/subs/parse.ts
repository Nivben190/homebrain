// Finds paid subscriptions and household bills in emails, by rules (no AI): known
// senders, App Store / Google Play / PayPal receipts itemized per subscription,
// utility bills (electricity, water, arnona, gas…) by sender or wording, and any
// other sender that charges the same way at a regular interval.
import { addDays, diffDays } from "@/lib/engine/habits";
import { APPLE_CANCEL, billerFor, billerIn, domainMatches, domainOf, PAYPAL_CANCEL, PLAY_CANCEL, senderName, SERVICES, type Category } from "./catalog";

export type Currency = "ILS" | "USD" | "EUR" | "GBP";
export type Cycle = "weekly" | "monthly" | "bimonthly" | "yearly";

export interface MailMessage {
  id: string;
  from: string;
  subject: string;
  /** Plain text of the body (see htmlToText). */
  text: string;
  date: Date;
  /** Text of its PDF attachments, read when the body itself has no amount (see needsAttachments). */
  attachments?: string;
}

/** One charge (or renewal notice) for one subscription, from one email. */
export interface Charge {
  key: string;
  name: string;
  icon: string;
  cancel: string | null;
  /** Known service / store receipt (vs. a generic sender that needs a pattern). */
  known: boolean;
  /** Generic sender whose email talks about a subscription/plan. */
  strong: boolean;
  messageId: string;
  day: string;
  amount: number | null;
  currency: Currency | null;
  cycle: Cycle | null;
  renews: string | null;
  subject: string;
  /** Not a charge: account mail (logins, passcodes, terms) that shows an account exists. */
  account?: boolean;
  category: Category;
  /** A household bill (electricity, water…): `renews` is its pay-by date. */
  bill?: boolean;
}

export interface DetectedSub {
  key: string;
  name: string;
  icon: string;
  cancel: string | null;
  amount: number | null;
  currency: Currency | null;
  cycle: Cycle;
  last: string;
  next: string | null;
  /** No charge for much longer than its cycle: maybe already cancelled. */
  stale: boolean;
  /** An active account with no receipts in this mailbox (billed elsewhere): price unknown. */
  unpriced?: boolean;
  category: Category;
  bill?: boolean;
  charges: { id: string; day: string; amount: number | null; currency: Currency | null; subject: string }[];
}

// ---------------------------------------------------------------------------- text

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", shy: "", zwnj: "", zwj: "", lrm: "", rlm: "", euro: "€", pound: "£" };

/** Readable lines from an HTML email: table cells and blocks become line breaks. */
export function htmlToText(html: string) {
  return html
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li|h\d|table|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .split("\n")
    .map((l) => l.replace(/[\s‎‏‪-‮]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------- money

const CUR = String.raw`₪|ש["״׳']?ח|ILS|NIS|US\$|USD|\$|EUR|€|GBP|£`;
const NUM = String.raw`\d{1,3}(?:[,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const BEFORE = new RegExp(String.raw`(${CUR})\s?(${NUM})`, "g");
const AFTER = new RegExp(String.raw`(${NUM})\s?(${CUR})`, "g");

function currencyOf(s: string): Currency {
  if (/₪|ש|ILS|NIS/.test(s)) return "ILS";
  if (/€|EUR/.test(s)) return "EUR";
  if (/£|GBP/.test(s)) return "GBP";
  return "USD";
}

function toNumber(s: string) {
  let n = s.replace(/\s/g, "");
  if (/,\d{1,2}$/.test(n) && !n.includes(".")) n = n.replace(/\.(?=\d{3})/g, "").replace(",", ".");
  else n = n.replace(/,/g, "");
  return Number(n);
}

export function findAmounts(text: string) {
  const out: { value: number; currency: Currency; index: number }[] = [];
  for (const m of text.matchAll(BEFORE)) out.push({ value: toNumber(m[2]), currency: currencyOf(m[1]), index: m.index! });
  for (const m of text.matchAll(AFTER)) if (!out.some((o) => Math.abs(o.index - m.index!) < m[0].length)) out.push({ value: toNumber(m[1]), currency: currencyOf(m[2]), index: m.index! });
  return out.filter((a) => Number.isFinite(a.value) && a.value > 0 && a.value < 100000).sort((a, b) => a.index - b.index);
}

const TOTAL = /total|סה["״']?כ|לתשלום|amount (paid|charged|due)|you paid|charged|billed|שולם|סכום החיוב|סכום/i;
const NOT_TOTAL = /sub-?total|tax|vat|מע["״']?מ|discount|הנחה|credit|זיכוי/i;

const CUR_ANYWHERE = new RegExp(CUR);
const DECIMAL = /\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/;

/** The charged amount: the "Total" line when there is one, else the first price. */
export function pickAmount(text: string): { value: number; currency: Currency } | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!TOTAL.test(lines[i]) || (NOT_TOTAL.test(lines[i]) && !/^\s*total\b|סה["״']?כ/i.test(lines[i]))) continue;
    const near = findAmounts(lines[i])[0] ?? findAmounts(lines[i + 1] ?? "")[0];
    if (near) return near;
    // Tables in PDFs: "1,695.40 סה"כ לתשלום בש"ח", the currency named apart from the number.
    const cur = lines[i].match(CUR_ANYWHERE);
    const n = lines[i].match(DECIMAL);
    if (cur && n && toNumber(n[0]) > 0 && toNumber(n[0]) < 100000) return { value: toNumber(n[0]), currency: currencyOf(cur[0]) };
  }
  return findAmounts(text)[0] ?? null;
}

// ---------------------------------------------------------------------------- dates & cycles

const EN_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};
const year = (y: string) => (y.length === 2 ? 2000 + +y : +y);

/** First date written in `s`: "3 Nov 2026", "November 3, 2026", "3 בנובמבר 2026", "2026-11-03", "03/11/2026" (day first). */
export function parseLooseDate(s: string): string | null {
  const en = EN_MONTHS.join("|");
  let m = s.match(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${en})[a-z]*\.?,?\s+(\d{4})`, "i"));
  if (m) return iso(+m[3], EN_MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1, +m[1]);
  m = s.match(new RegExp(String.raw`\b(${en})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})`, "i"));
  if (m) return iso(+m[3], EN_MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1, +m[2]);
  m = s.match(new RegExp(String.raw`(\d{1,2})\s+ב?(${HE_MONTHS.join("|")})\s+(\d{4})`));
  if (m) return iso(+m[3], HE_MONTHS.indexOf(m[2]) + 1, +m[1]);
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})\b/);
  if (m) return iso(year(m[3]), +m[2], +m[1]);
  return null;
}

const RENEWS = /renews?\b|renewal date|auto-?renews?|next (billing|payment|charge|bill)|will be (charged|billed|renewed)|מתחדש|יתחדש|חידוש|החיוב הבא|תאריך החיוב/i;
/** A bill's pay-by date. */
const DUE = /due (date|by|on)|pay(ment)? by|payment due|לתשלום עד|מועד (אחרון )?(ל)?תשלום|תאריך (אחרון )?(ל)?תשלום|יש לשלם עד|עד לתאריך|תאריך חיוב|ייגבה ב/i;

/** "Renews 3 Nov 2026" / "next billing date: …" anywhere in the text (or a bill's "pay by"). */
export function findRenewal(text: string, words = RENEWS): string | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(words);
    if (!m) continue;
    const d = parseLooseDate(lines[i].slice(m.index)) ?? parseLooseDate(lines[i + 1] ?? "");
    if (d) return d;
  }
  return null;
}

const YEARLY = /\b(yearly|annual(ly)?|per year|a year|1 year|12 months)\b|\/\s?(yr|year)\b|שנתי|לשנה|שנה אחת/gi;
const MONTHLY = /\b(monthly|per month|a month|1 month)\b|\/\s?(mo|month)\b|חודשי|לחודש/gi;
const BIMONTHLY = /\bbi-?monthly\b|every (2|two) months|דו[-־ ]?חודשי|לחודשיים|כל חודשיים|תקופת חיוב של חודשיים/gi;
const WEEKLY = /\b(weekly|per week|1 week)\b|\/\s?(wk|week)\b|שבועי|לשבוע/gi;

export function detectCycle(text: string): Cycle | null {
  // "דו-חודשי" contains "חודשי": two-monthly wins when it's said at all.
  if (BIMONTHLY.test(text)) return (BIMONTHLY.lastIndex = 0), "bimonthly";
  const y = text.match(YEARLY)?.length ?? 0;
  const mo = text.match(MONTHLY)?.length ?? 0;
  const w = text.match(WEEKLY)?.length ?? 0;
  if (!y && !mo && !w) return null;
  if (w > mo && w > y) return "weekly";
  return y > mo ? "yearly" : "monthly";
}

const CYCLE_DAYS: Record<Cycle, number> = { weekly: 7, monthly: 30, bimonthly: 61, yearly: 365 };
const CYCLE_MONTHS: Record<Exclude<Cycle, "weekly">, number> = { monthly: 1, bimonthly: 2, yearly: 12 };

function addCycle(day: string, cycle: Cycle) {
  if (cycle === "weekly") return addDays(day, 7);
  const [y, m, d] = day.split("-").map(Number);
  const months = CYCLE_MONTHS[cycle];
  const ty = y + Math.floor((m - 1 + months) / 12);
  const tm = ((m - 1 + months) % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return iso(ty, tm, Math.min(d, last))!;
}

/** The first renewal on or after `today`, counting cycles from the last charge. */
export function rollForward(last: string, cycle: Cycle, today: string) {
  let next = addCycle(last, cycle);
  for (let i = 0; i < 600 && diffDays(today, next) < 0; i++) next = addCycle(next, cycle);
  return next;
}

// ---------------------------------------------------------------------------- per email

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const RECEIPT = /receipt|invoice|your (order|payment)|payment (received|confirmation|successful)|subscription|renew|membership|billing|charged|קבלה|קבלת תשלום|חשבונית|מנוי|חידוש|אישור (על )?תשלום|חיוב/i;
const SUBSCRIPTIONY = /subscription|renew|membership|monthly|annual|yearly|your plan|מנוי|חידוש|חודשי|שנתי/i;
/** A known service's email only counts when its subject is about money, not news or policy updates. */
const BILLING_SUBJECT = /receipt|invoice|payment|paid|charged|billing|\bbill\b|renew|subscription|membership|your order|your plan|קבלה|חשבונית|תשלום|חיוב|חידוש|מנוי/i;
/** A bill email (not news or a survey from the same company). */
const BILL_SUBJECT = /\bbill\b|invoice|statement|payment|receipt|חשבון|חשבונית|דרישת תשלום|שובר|תשלום|קבלה|חיוב|ארנונה|הודעת חיוב|דמי ביטוח|פוליסה/i;
/** Failed or paused payments aren't charges. */
const FAILED = /unsuccessful|failed|declined|couldn['’]t (be )?(process|charge|complete)|unable to (process|charge)|paused|past due|action required|נכשל|לא הצליח|נדחה|לא עבר/i;
/** Account mail from a known service: proof of an account, though not of a price. */
const ACCOUNT = /new (login|sign-?in|device)|one-time (passcode|code)|passcode|verification code|subscriber agreement|terms of use|account (has been )?updated|updated your .*account|welcome to|profile|content rating|כניסה חדשה|קוד (חד|אימות)|ברוכים הבאים|החשבון שלך|תנאי (השימוש|המנוי)/i;
/** Marketing ("פרסומת" is the legally required Israeli ad label) reaches non-subscribers too. */
const PROMO = /פרסומת|newsletter|\bsale\b|% off|new on|now streaming|coming soon|download the|עכשיו ב/i;
/** Travel and one-off bookings: a receipt, but never a subscription. */
const ONE_OFF_DOMAINS = ["booking.com", "airbnb.com", "expedia.com", "agoda.com", "hotels.com", "trip.com", "kiwi.com", "elal.com", "elal.co.il", "ryanair.com", "wizzair.com", "easyjet.com", "gett.com", "wolt.com", "10bis.co.il", "aliexpress.com", "amazon.com", "ebay.com", "etsy.com", "shein.com"];
const ONE_OFF = /reservation|booking|your stay|check-?in|hotel|flight|itinerary|e-?ticket|boarding|your order|order (#|no|number)|shipped|delivery|הזמנ|טיסה|מלון|כרטיס טיסה|משלוח/i;
const NOISE = /^(report a problem|write a review|דווח על בעיה|כתוב ביקורת|app store|apple music|icloud)$/i;
const CYCLE_IN_NAME = /\s*\((monthly|yearly|annual|1 month|1 year|weekly|חודשי|שנתי)\)\s*/i;

/** App Store receipt: one subscription per "Renews …" line. */
function appleItems(msg: MailMessage): Omit<Charge, "messageId" | "day" | "subject">[] {
  const lines = msg.text.split("\n");
  const out: Omit<Charge, "messageId" | "day" | "subject">[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\b(renews|auto-renews|מתחדש|יתחדש)\b/i);
    if (!m) continue;
    const renews = parseLooseDate(lines[i].slice(m.index)) ?? parseLooseDate(lines[i + 1] ?? "");
    // Name: text before "Renews" on the same row, else the closest line above that isn't a price.
    let name = lines[i].slice(0, m.index).trim();
    for (let j = i - 1; !name && j >= Math.max(0, i - 3); j--) {
      const l = lines[j].trim();
      if (l && !NOISE.test(l) && !findAmounts(l).length && !parseLooseDate(l)) name = l;
    }
    if (!name) continue;
    const cycle = detectCycle(name) ?? detectCycle(lines[i]);
    const price = findAmounts([lines[i], lines[i + 1] ?? "", lines[i + 2] ?? "", lines[i + 3] ?? ""].join("\n"))[0] ?? null;
    const clean = name.replace(CYCLE_IN_NAME, " ").replace(/\s+/g, " ").trim();
    out.push({ key: `apple:${norm(clean)}`, name: clean, icon: "🍎", cancel: APPLE_CANCEL, known: true, strong: true, amount: price?.value ?? null, currency: price?.currency ?? null, cycle, renews, category: "apps" });
  }
  return out;
}

/** A bill or receipt whose body has no amount: it's worth opening its PDF. */
export function needsAttachments(msg: Pick<MailMessage, "subject" | "text">) {
  return (BILL_SUBJECT.test(msg.subject) || RECEIPT.test(msg.subject)) && !FAILED.test(msg.subject) && !PROMO.test(msg.subject) && !pickAmount(msg.text);
}

/** Everything a single email says about subscriptions (usually 0 or 1). */
export function chargesFrom(msg: MailMessage): Charge[] {
  const domain = domainOf(msg.from);
  const doc = msg.attachments ?? "";
  const all = `${msg.subject}\n${msg.text}\n${doc}`;
  const base = { messageId: msg.id, day: dayOf(msg.date), subject: msg.subject };
  if (FAILED.test(msg.subject)) return [];
  const amount = pickAmount(msg.text) ?? (doc ? pickAmount(doc) : null);

  if (domainMatches(domain, "apple.com")) {
    if (!/receipt|קבלה|subscription|מנוי/i.test(msg.subject)) return [];
    return appleItems(msg).map((c) => ({ ...c, ...base }));
  }

  if (domainMatches(domain, "google.com") && /google play/i.test(msg.subject) && /auto-renewing|subscription|מנוי/i.test(msg.text)) {
    const lines = msg.text.split("\n");
    const at = lines.findIndex((l) => /auto-renewing|מנוי מתחדש/i.test(l));
    const name = (at > 0 ? lines[at - 1] : msg.subject).replace(/\s*\(.*?\)\s*$/, "").trim();
    return [{ ...base, key: `play:${norm(name)}`, name, icon: "📲", cancel: PLAY_CANCEL, known: true, strong: true, amount: amount?.value ?? null, currency: amount?.currency ?? null, cycle: detectCycle(all), renews: findRenewal(msg.text), category: "apps" }];
  }

  if (/(^|\.)paypal\./.test(domain)) {
    if (!/automatic|recurring|subscription|preapproved|אוטומטי|מנוי/i.test(all)) return [];
    const merchant = (msg.subject.match(/(?:payment to|paid|sent .*? to|ל)\s*:?\s*([^,]+?)\s*$/i)?.[1] ?? msg.text.match(/merchant\s*:?\s*\n?([^\n]{2,40})/i)?.[1] ?? "").trim();
    if (!merchant) return [];
    return [{ ...base, key: `paypal:${norm(merchant)}`, name: merchant, icon: "🅿️", cancel: PAYPAL_CANCEL, known: true, strong: true, amount: amount?.value ?? null, currency: amount?.currency ?? null, cycle: detectCycle(all), renews: findRenewal(msg.text), category: "other" }];
  }

  // Household bills: the electric company, the water corporation, the city (arnona)…
  // A payment site's receipt names the biller only inside: "הופק עבור מפעל המים כפר סבא".
  const listed = SERVICES.some((s) => s.domains.some((d) => domainMatches(domain, d)));
  const billLike = BILL_SUBJECT.test(msg.subject) || RECEIPT.test(msg.subject);
  const biller = billerFor(domain, senderName(msg.from), msg.subject) ?? (!listed && billLike ? billerIn(domain, `${msg.text.slice(0, 4000)}\n${doc.slice(0, 4000)}`) : null);
  if (biller) {
    if (PROMO.test(msg.subject) || !(billLike || BILL_SUBJECT.test(senderName(msg.from)))) return [];
    return [{ ...base, key: biller.key, name: biller.name, icon: biller.icon, cancel: null, known: true, strong: true, bill: true, category: biller.category, amount: amount?.value ?? null, currency: amount?.currency ?? null, cycle: detectCycle(all), renews: findRenewal(`${msg.text}\n${doc}`, DUE) }];
  }

  const sender = SERVICES.find((s) => s.domains.some((d) => domainMatches(domain, d)));
  if (sender && !BILLING_SUBJECT.test(msg.subject) && ACCOUNT.test(msg.subject) && !PROMO.test(msg.subject))
    return [{ ...base, key: sender.key, name: sender.name, icon: sender.icon, cancel: sender.cancel, known: true, strong: false, account: true, amount: null, currency: null, cycle: null, renews: null, category: sender.category, bill: sender.bill }];

  // Several services can share a domain; the receipt's wording picks which.
  const service = SERVICES.find((s) => s.domains.some((d) => domainMatches(domain, d)) && (!s.match || s.match.test(all)));
  if (service) {
    if (!BILLING_SUBJECT.test(msg.subject)) return [];
    return [{ ...base, key: service.key, name: service.name, icon: service.icon, cancel: service.cancel, known: true, strong: true, category: service.category, bill: service.bill, amount: amount?.value ?? null, currency: amount?.currency ?? null, cycle: detectCycle(all), renews: findRenewal(msg.text, service.bill ? DUE : RENEWS) }];
  }
  // Mail from a known service that isn't a charge (newsletters, shopping orders).
  if (SERVICES.some((s) => s.domains.some((d) => domainMatches(domain, d))) || domainMatches(domain, "google.com") || domainMatches(domain, "apple.com")) return [];

  if (!RECEIPT.test(msg.subject) || !amount) return [];
  if (ONE_OFF_DOMAINS.some((d) => domainMatches(domain, d)) || ONE_OFF.test(msg.subject) || ONE_OFF.test(senderName(msg.from))) return [];
  const labels = domain.split(".");
  const site = labels.slice(/\.(co|org|net|ac|gov)\.[a-z]{2}$/.test(domain) ? -3 : -2).join(".");
  return [{ ...base, key: `mail:${site}`, name: senderName(msg.from), icon: "💳", cancel: null, known: false, strong: SUBSCRIPTIONY.test(all), amount: amount.value, currency: amount.currency, cycle: detectCycle(all), renews: findRenewal(msg.text), category: "other" }];
}

// ---------------------------------------------------------------------------- all emails

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function cycleFromGaps(days: string[]): Cycle | null {
  if (days.length < 2) return null;
  const gaps = days.slice(1).map((d, i) => diffDays(days[i], d)).filter((g) => g > 3);
  if (!gaps.length) return null;
  const g = median(gaps);
  if (g >= 5 && g <= 9) return "weekly";
  if (g >= 25 && g <= 35) return "monthly";
  if (g >= 50 && g <= 70) return "bimonthly";
  if (g >= 330 && g <= 400) return "yearly";
  return null;
}

/** Groups charges into subscriptions; generic senders need a regular pattern. */
export function summarize(charges: Charge[], today: string): DetectedSub[] {
  const groups = new Map<string, Charge[]>();
  const seen = new Set<string>();
  for (const c of charges) {
    // The same email often arrives more than once (aliases, forwards).
    const id = `${c.key}|${c.day}|${c.subject}|${c.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    groups.set(c.key, [...(groups.get(c.key) ?? []), c]);
  }

  const out: DetectedSub[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.day.localeCompare(b.day));
    const accountOnly = list.every((c) => c.account);
    if (accountOnly) {
      // Logins and passcodes lately, but no receipt here: the account is live and billed somewhere else.
      const latest = list.at(-1)!;
      if (diffDays(latest.day, today) <= 60) out.push({ key, name: latest.name, icon: latest.icon, cancel: latest.cancel, amount: null, currency: null, cycle: "monthly", last: latest.day, next: null, stale: false, unpriced: true, category: latest.category, bill: latest.bill, charges: [] });
      continue;
    }
    list.splice(0, list.length, ...list.filter((c) => !c.account));
    const paid = list.filter((c) => c.amount !== null);
    // Same-day duplicates (receipt + invoice) count once for the pattern.
    const payDays = [...new Set(paid.map((c) => c.day))];
    const gapCycle = cycleFromGaps(payDays);
    const latest = list.at(-1)!;
    const renewsAhead = [...list].reverse().find((c) => c.renews && diffDays(today, c.renews) >= 0)?.renews ?? null;

    const known = list.some((c) => c.known);
    const bill = list.some((c) => c.bill);
    // A bill's amount is often only in the attached PDF: two bills from the same biller are enough.
    if (bill ? !paid.length && !renewsAhead && list.length < 2 : known ? !paid.length && !renewsAhead : !(gapCycle && paid.length >= 2) && !(latest.strong && renewsAhead && paid.length)) continue;

    const votes = list.map((c) => c.cycle).filter(Boolean) as Cycle[];
    const textCycle = votes.length ? (["yearly", "bimonthly", "monthly", "weekly"] as Cycle[]).sort((a, b) => votes.filter((v) => v === b).length - votes.filter((v) => v === a).length)[0] : null;
    // Bills mention "per month" in passing; the real rhythm is when they arrive.
    const billGaps = bill ? cycleFromGaps([...new Set(list.map((c) => c.day))]) : null;
    const cycle = bill ? (billGaps ?? textCycle ?? defaultCycle(latest.category)) : (textCycle ?? gapCycle ?? "monthly");
    const lastPaid = paid.at(-1) ?? null;
    const last = (lastPaid ?? latest).day;
    const next = renewsAhead ?? rollForward(last, cycle, today);
    out.push({
      key,
      name: latest.name,
      icon: latest.icon,
      cancel: latest.cancel,
      category: latest.category,
      ...(bill ? { bill: true } : {}),
      amount: lastPaid?.amount ?? null,
      currency: lastPaid?.currency ?? null,
      cycle,
      last,
      next,
      stale: !renewsAhead && diffDays(last, today) > CYCLE_DAYS[cycle] * 1.5 + 7,
      charges: [...list]
        .reverse()
        .slice(0, 8)
        .map((c) => ({ id: c.messageId, day: c.day, amount: c.amount, currency: c.currency, subject: c.subject.slice(0, 120) })),
    });
  }
  return out.sort((a, b) => (a.next ?? "9").localeCompare(b.next ?? "9"));
}

/** Electricity, water and arnona come every two months in Israel; the rest monthly, until the emails say otherwise. */
function defaultCycle(category: Category): Cycle {
  return category === "electricity" || category === "arnona" || category === "water" ? "bimonthly" : "monthly";
}

/** Rough monthly cost, for totals. */
export function monthlyCost(amount: number, cycle: Cycle) {
  return cycle === "yearly" ? amount / 12 : cycle === "bimonthly" ? amount / 2 : cycle === "weekly" ? (amount * 52) / 12 : amount;
}
