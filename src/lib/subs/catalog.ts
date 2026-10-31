// Known subscription services and household billers: who sends their receipts
// or bills, what kind of expense each is, and where to cancel. A service's emails
// count only when they look like a charge for it (`match`), so e.g. Amazon
// shopping orders don't show up as "Amazon Prime".

/** What an expense is, for grouping the space. Bills first, then subscriptions. */
export const BILL_CATEGORIES = ["electricity", "water", "arnona", "gas", "phone", "internet", "tv", "insurance", "building"] as const;
export const SUB_CATEGORIES = ["streaming", "music", "ai", "software", "cloud", "apps", "wellness", "shopping", "other"] as const;
export type Category = (typeof BILL_CATEGORIES)[number] | (typeof SUB_CATEGORIES)[number];
export const CATEGORIES: Category[] = [...BILL_CATEGORIES, ...SUB_CATEGORIES];
export const CATEGORY_ICON: Record<Category, string> = {
  electricity: "⚡",
  water: "💧",
  arnona: "🏛️",
  gas: "🔥",
  phone: "📱",
  internet: "🌐",
  tv: "📺",
  insurance: "🛡️",
  building: "🏢",
  streaming: "🎬",
  music: "🎵",
  ai: "🤖",
  software: "💻",
  cloud: "☁️",
  apps: "📲",
  wellness: "🧘",
  shopping: "📦",
  other: "💳",
};
export const isBillCategory = (c: Category) => (BILL_CATEGORIES as readonly string[]).includes(c);

export interface Service {
  key: string;
  name: string;
  icon: string;
  /** Sender domains (subdomains match too). */
  domains: string[];
  /** Subject + body must match, when set. */
  match?: RegExp;
  cancel: string;
  category: Category;
  /** A household bill (phone, internet, TV) rather than something you subscribed to. */
  bill?: boolean;
}

export const SERVICES: Service[] = [
  { key: "netflix", name: "Netflix", icon: "🎬", domains: ["netflix.com"], match: /payment|receipt|billing|membership|חיוב|קבלה|מנוי|תשלום/i, cancel: "https://www.netflix.com/cancelplan" , category: "streaming" },
  { key: "spotify", name: "Spotify", icon: "🎵", domains: ["spotify.com"], match: /receipt|premium|payment|קבלה|תשלום/i, cancel: "https://www.spotify.com/account/subscription/" , category: "music" },
  { key: "disney", name: "Disney+", icon: "🏰", domains: ["disneyplus.com", "disney.com"], match: /receipt|subscription|billing|payment|קבלה|מנוי|תשלום/i, cancel: "https://www.disneyplus.com/account/subscription" , category: "streaming" },
  { key: "youtube", name: "YouTube Premium", icon: "▶️", domains: ["youtube.com", "google.com"], match: /youtube (premium|music)/i, cancel: "https://www.youtube.com/paid_memberships" , category: "streaming" },
  { key: "google-one", name: "Google One", icon: "☁️", domains: ["google.com"], match: /google one/i, cancel: "https://one.google.com/settings" , category: "cloud" },
  { key: "chatgpt", name: "ChatGPT", icon: "🤖", domains: ["openai.com"], match: /receipt|invoice|subscription|chatgpt (plus|pro)|קבלה/i, cancel: "https://chatgpt.com/#settings/Subscription" , category: "ai" },
  { key: "claude", name: "Claude", icon: "🧠", domains: ["anthropic.com"], match: /receipt|invoice|subscription|קבלה/i, cancel: "https://claude.ai/settings/billing" , category: "ai" },
  { key: "amazon-prime", name: "Amazon Prime", icon: "📦", domains: ["amazon.com", "amazon.co.uk", "amazon.de"], match: /prime (membership|video)|prime renew/i, cancel: "https://www.amazon.com/mc" , category: "shopping" },
  { key: "max", name: "Max", icon: "📺", domains: ["max.com", "hbomax.com"], match: /receipt|subscription|payment|billing/i, cancel: "https://auth.max.com/subscription" , category: "streaming" },
  { key: "dropbox", name: "Dropbox", icon: "📁", domains: ["dropbox.com"], match: /receipt|invoice|renew|payment|subscription/i, cancel: "https://www.dropbox.com/account/plan" , category: "cloud" },
  { key: "microsoft", name: "Microsoft 365", icon: "🪟", domains: ["microsoft.com"], match: /microsoft 365|office 365|xbox game pass|subscription|renew/i, cancel: "https://account.microsoft.com/services" , category: "software" },
  { key: "adobe", name: "Adobe", icon: "🎨", domains: ["adobe.com"], match: /invoice|receipt|subscription|plan|payment/i, cancel: "https://account.adobe.com/plans" , category: "software" },
  { key: "canva", name: "Canva", icon: "🖌️", domains: ["canva.com"], match: /receipt|invoice|subscription|pro/i, cancel: "https://www.canva.com/settings/billing-and-teams" , category: "software" },
  { key: "notion", name: "Notion", icon: "📓", domains: ["notion.so", "makenotion.com"], match: /receipt|invoice|subscription|payment/i, cancel: "https://www.notion.so/my-account" , category: "software" },
  { key: "github", name: "GitHub", icon: "🐙", domains: ["github.com"], match: /receipt|payment|billing|copilot|subscription/i, cancel: "https://github.com/settings/billing" , category: "software" },
  { key: "cursor", name: "Cursor", icon: "⌨️", domains: ["cursor.com", "cursor.sh"], match: /receipt|invoice|subscription|pro/i, cancel: "https://cursor.com/settings" , category: "ai" },
  { key: "jetbrains", name: "JetBrains", icon: "🧰", domains: ["jetbrains.com"], match: /invoice|receipt|subscription|renew/i, cancel: "https://account.jetbrains.com/licenses" , category: "software" },
  { key: "vercel", name: "Vercel", icon: "▲", domains: ["vercel.com"], match: /invoice|receipt|payment/i, cancel: "https://vercel.com/account/billing" , category: "software" },
  { key: "linkedin", name: "LinkedIn Premium", icon: "💼", domains: ["linkedin.com"], match: /premium/i, cancel: "https://www.linkedin.com/premium/manage" , category: "other" },
  { key: "duolingo", name: "Duolingo", icon: "🦉", domains: ["duolingo.com"], match: /receipt|super|subscription|max/i, cancel: "https://www.duolingo.com/settings/subscription" , category: "apps" },
  { key: "audible", name: "Audible", icon: "🎧", domains: ["audible.com"], match: /membership|receipt|credit/i, cancel: "https://www.audible.com/account/overview" , category: "music" },
  { key: "patreon", name: "Patreon", icon: "🎗️", domains: ["patreon.com"], match: /receipt|payment|charged/i, cancel: "https://www.patreon.com/settings/memberships" , category: "other" },
  { key: "nordvpn", name: "NordVPN", icon: "🛡️", domains: ["nordvpn.com", "nordaccount.com"], match: /receipt|renew|subscription|payment/i, cancel: "https://my.nordaccount.com/billing/" , category: "software" },
  { key: "headspace", name: "Headspace", icon: "🧘", domains: ["headspace.com"], match: /receipt|subscription|renew/i, cancel: "https://www.headspace.com/subscriptions" , category: "wellness" },
  { key: "strava", name: "Strava", icon: "🏃", domains: ["strava.com"], match: /receipt|subscription|renew/i, cancel: "https://www.strava.com/account" , category: "wellness" },
  { key: "wolt", name: "Wolt+", icon: "🛵", domains: ["wolt.com"], match: /wolt\+|wolt plus|וולט\+/i, cancel: "https://wolt.com/me/wolt-plus" , category: "shopping" },
  // Israeli providers: monthly bills.
  { key: "partner", name: "Partner", icon: "📱", domains: ["partner.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.partner.co.il/" , category: "phone", bill: true },
  { key: "cellcom", name: "Cellcom", icon: "📱", domains: ["cellcom.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.cellcom.co.il/" , category: "phone", bill: true },
  { key: "pelephone", name: "Pelephone", icon: "📱", domains: ["pelephone.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.pelephone.co.il/" , category: "phone", bill: true },
  { key: "hot", name: "HOT", icon: "📺", domains: ["hot.net.il", "hotmobile.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.hot.net.il/" , category: "tv", bill: true },
  { key: "yes", name: "yes", icon: "📺", domains: ["yes.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.yes.co.il/" , category: "tv", bill: true },
  { key: "bezeq", name: "Bezeq", icon: "☎️", domains: ["bezeq.co.il", "bezeqint.net"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.bezeq.co.il/" , category: "internet", bill: true },
  { key: "golan", name: "Golan Telecom", icon: "📱", domains: ["golantelecom.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.golantelecom.co.il/" , category: "phone", bill: true },
];

/** A household biller: by sender domain, or by name in the sender or subject. */
export interface Biller {
  key: string;
  name: string;
  icon: string;
  category: Category;
  domains: string[];
  words?: RegExp;
}

export const BILLERS: Biller[] = [
  { key: "bill:iec", name: "חברת החשמל", icon: "⚡", category: "electricity", domains: ["iec.co.il"], words: /חברת החשמל|חשבון (ה)?חשמל|electricity bill|israel electric/i },
  { key: "bill:electricity", name: "חשמל", icon: "⚡", category: "electricity", domains: ["electra-power.co.il", "amisragas-energy.co.il", "cellcom-energy.co.il", "bezeq-energy.co.il"], words: /צריכת חשמל|ספק חשמל/i },
  { key: "bill:water", name: "מים", icon: "💧", category: "water", domains: ["meiavivim.co.il", "mei-avivim.co.il", "hagihon.co.il", "meisheva.co.il", "meicarmel.co.il", "mei-netanya.co.il", "meiraanana.co.il", "mei-raanana.co.il", "plagey.co.il", "yuvalim.co.il", "mainet.co.il"], words: /מפעל (ה)?מים(?: [א-ת"״']{2,}){0,3}|חשבון (ה)?מים|תאגיד (ה)?מים|אגרת ביוב|מים וביוב|צריכת מים|water bill|מי אביבים|הגיחון|מי שבע|מי כרמל|מי נתניה|מי רעננה|מי מודיעין|מי הרצליה|מי רמת גן|מי כפר סבא|מי הוד השרון|מי ציונה|מי אשקלון|מי עכו|מי לוד|מי שמש|פלגי מוצקין|יובלים|מניב ראשון|עין אפק|מיתב|הרי נצרת|מי רהט|מי ברק|מי נע["״]?ם/i },
  { key: "bill:arnona", name: "ארנונה", icon: "🏛️", category: "arnona", domains: ["muni.il"], words: /ארנונה|arnona|עיריית|מועצה (מקומית|אזורית)|municipality/i },
  { key: "bill:gas", name: "גז", icon: "🔥", category: "gas", domains: ["supergas.co.il", "amisragas.co.il", "pazgas.co.il", "dorgas.co.il"], words: /חשבון (ה)?גז|סופרגז|אמישראגז|פזגז|דורגז|גז בישול/i },
  { key: "bill:internet", name: "אינטרנט", icon: "🌐", category: "internet", domains: ["012.net.il", "triplec.co.il", "netvision.co.il", "xfone.co.il", "we4g.co.il"], words: /חשבון (ה)?אינטרנט|ספק (ה)?אינטרנט|internet bill/i },
  { key: "bill:insurance", name: "ביטוח", icon: "🛡️", category: "insurance", domains: ["harel-group.co.il", "migdal.co.il", "clalbit.co.il", "fnx.co.il", "menoramivt.co.il", "aig.co.il", "libra.co.il", "shirbit.co.il", "ayalon-ins.co.il", "9mil.co.il", "wesure.co.il"], words: /דמי ביטוח|פוליסת ביטוח|חידוש (ה)?פוליסה|insurance premium/i },
  { key: "bill:building", name: "ועד בית", icon: "🏢", category: "building", domains: [], words: /ועד (ה)?בית|דמי ניהול|building fee/i },
];

/** The biller behind an email, or null. A bill from a city water corporation keeps its own name. */
export function billerFor(domain: string, sender: string, subject: string): Biller | null {
  const text = `${sender}\n${subject}`;
  const b = BILLERS.find((x) => x.domains.some((d) => domainMatches(domain, d))) ?? BILLERS.find((x) => x.words?.test(text));
  if (!b) return null;
  if (b.key === "bill:iec") return b;
  // "מי אביבים", "עיריית חיפה": the sender's own name says more than "Water", and keeps two cities apart.
  const name = sender && !/no-?reply|service|mailer/i.test(sender) && sender.length <= 30 ? sender : b.name;
  const site = domain.split(".").slice(/\.(co|org|net|ac|gov|muni)\.[a-z]{2}$/.test(domain) ? -3 : -2).join(".");
  return { ...b, key: `${b.key}:${site || "mail"}`, name };
}

/**
 * The biller named inside a bill or receipt (body or PDF), for mail sent by a
 * payment site. Keeps the name as written ("מפעל המים כפר סבא") when it's short.
 */
export function billerIn(domain: string, text: string): Biller | null {
  for (const b of BILLERS) {
    const said = (b.words && text.match(b.words)?.[0].trim()) || "";
    if (!said) continue;
    const site = domain.split(".").slice(/\.(co|org|net|ac|gov|muni)\.[a-z]{2}$/.test(domain) ? -3 : -2).join(".");
    return { ...b, key: `${b.key}:${site || "mail"}`, name: said.includes(" ") && said.length <= 25 ? said : b.name };
  }
  return null;
}

/** Where to manage subscriptions bought through a store. */
export const APPLE_CANCEL = "https://apps.apple.com/account/subscriptions";
export const PLAY_CANCEL = "https://play.google.com/store/account/subscriptions";
export const PAYPAL_CANCEL = "https://www.paypal.com/myaccount/autopay/";

export const domainOf = (from: string) => (from.match(/@([\w.-]+)/)?.[1] ?? "").toLowerCase();
export const domainMatches = (domain: string, d: string) => domain === d || domain.endsWith(`.${d}`);

/** Display name from a From header: `"Netflix" <info@mailer.netflix.com>` → Netflix. */
export function senderName(from: string) {
  const name = from.replace(/<[^>]*>/, "").replace(/["']/g, "").trim();
  return name || domainOf(from).split(".").slice(-2, -1)[0] || from;
}
