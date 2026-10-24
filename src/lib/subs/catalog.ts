// Known subscription services: who sends their receipts, and where to cancel.
// A service's emails count only when they look like a charge for it (`match`),
// so e.g. Amazon shopping orders don't show up as "Amazon Prime".

export interface Service {
  key: string;
  name: string;
  icon: string;
  /** Sender domains (subdomains match too). */
  domains: string[];
  /** Subject + body must match, when set. */
  match?: RegExp;
  cancel: string;
}

export const SERVICES: Service[] = [
  { key: "netflix", name: "Netflix", icon: "🎬", domains: ["netflix.com"], match: /payment|receipt|billing|membership|חיוב|קבלה|מנוי|תשלום/i, cancel: "https://www.netflix.com/cancelplan" },
  { key: "spotify", name: "Spotify", icon: "🎵", domains: ["spotify.com"], match: /receipt|premium|payment|קבלה|תשלום/i, cancel: "https://www.spotify.com/account/subscription/" },
  { key: "disney", name: "Disney+", icon: "🏰", domains: ["disneyplus.com", "disney.com"], match: /receipt|subscription|billing|payment|קבלה|מנוי|תשלום/i, cancel: "https://www.disneyplus.com/account/subscription" },
  { key: "youtube", name: "YouTube Premium", icon: "▶️", domains: ["youtube.com", "google.com"], match: /youtube (premium|music)/i, cancel: "https://www.youtube.com/paid_memberships" },
  { key: "google-one", name: "Google One", icon: "☁️", domains: ["google.com"], match: /google one/i, cancel: "https://one.google.com/settings" },
  { key: "chatgpt", name: "ChatGPT", icon: "🤖", domains: ["openai.com"], match: /receipt|invoice|subscription|chatgpt (plus|pro)|קבלה/i, cancel: "https://chatgpt.com/#settings/Subscription" },
  { key: "claude", name: "Claude", icon: "🧠", domains: ["anthropic.com"], match: /receipt|invoice|subscription|קבלה/i, cancel: "https://claude.ai/settings/billing" },
  { key: "amazon-prime", name: "Amazon Prime", icon: "📦", domains: ["amazon.com", "amazon.co.uk", "amazon.de"], match: /prime (membership|video)|prime renew/i, cancel: "https://www.amazon.com/mc" },
  { key: "max", name: "Max", icon: "📺", domains: ["max.com", "hbomax.com"], match: /receipt|subscription|payment|billing/i, cancel: "https://auth.max.com/subscription" },
  { key: "dropbox", name: "Dropbox", icon: "📁", domains: ["dropbox.com"], match: /receipt|invoice|renew|payment|subscription/i, cancel: "https://www.dropbox.com/account/plan" },
  { key: "microsoft", name: "Microsoft 365", icon: "🪟", domains: ["microsoft.com"], match: /microsoft 365|office 365|xbox game pass|subscription|renew/i, cancel: "https://account.microsoft.com/services" },
  { key: "adobe", name: "Adobe", icon: "🎨", domains: ["adobe.com"], match: /invoice|receipt|subscription|plan|payment/i, cancel: "https://account.adobe.com/plans" },
  { key: "canva", name: "Canva", icon: "🖌️", domains: ["canva.com"], match: /receipt|invoice|subscription|pro/i, cancel: "https://www.canva.com/settings/billing-and-teams" },
  { key: "notion", name: "Notion", icon: "📓", domains: ["notion.so", "makenotion.com"], match: /receipt|invoice|subscription|payment/i, cancel: "https://www.notion.so/my-account" },
  { key: "github", name: "GitHub", icon: "🐙", domains: ["github.com"], match: /receipt|payment|billing|copilot|subscription/i, cancel: "https://github.com/settings/billing" },
  { key: "cursor", name: "Cursor", icon: "⌨️", domains: ["cursor.com", "cursor.sh"], match: /receipt|invoice|subscription|pro/i, cancel: "https://cursor.com/settings" },
  { key: "jetbrains", name: "JetBrains", icon: "🧰", domains: ["jetbrains.com"], match: /invoice|receipt|subscription|renew/i, cancel: "https://account.jetbrains.com/licenses" },
  { key: "vercel", name: "Vercel", icon: "▲", domains: ["vercel.com"], match: /invoice|receipt|payment/i, cancel: "https://vercel.com/account/billing" },
  { key: "linkedin", name: "LinkedIn Premium", icon: "💼", domains: ["linkedin.com"], match: /premium/i, cancel: "https://www.linkedin.com/premium/manage" },
  { key: "duolingo", name: "Duolingo", icon: "🦉", domains: ["duolingo.com"], match: /receipt|super|subscription|max/i, cancel: "https://www.duolingo.com/settings/subscription" },
  { key: "audible", name: "Audible", icon: "🎧", domains: ["audible.com"], match: /membership|receipt|credit/i, cancel: "https://www.audible.com/account/overview" },
  { key: "patreon", name: "Patreon", icon: "🎗️", domains: ["patreon.com"], match: /receipt|payment|charged/i, cancel: "https://www.patreon.com/settings/memberships" },
  { key: "nordvpn", name: "NordVPN", icon: "🛡️", domains: ["nordvpn.com", "nordaccount.com"], match: /receipt|renew|subscription|payment/i, cancel: "https://my.nordaccount.com/billing/" },
  { key: "headspace", name: "Headspace", icon: "🧘", domains: ["headspace.com"], match: /receipt|subscription|renew/i, cancel: "https://www.headspace.com/subscriptions" },
  { key: "strava", name: "Strava", icon: "🏃", domains: ["strava.com"], match: /receipt|subscription|renew/i, cancel: "https://www.strava.com/account" },
  { key: "wolt", name: "Wolt+", icon: "🛵", domains: ["wolt.com"], match: /wolt\+|wolt plus|וולט\+/i, cancel: "https://wolt.com/me/wolt-plus" },
  // Israeli providers: monthly bills.
  { key: "partner", name: "Partner", icon: "📱", domains: ["partner.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.partner.co.il/" },
  { key: "cellcom", name: "Cellcom", icon: "📱", domains: ["cellcom.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.cellcom.co.il/" },
  { key: "pelephone", name: "Pelephone", icon: "📱", domains: ["pelephone.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.pelephone.co.il/" },
  { key: "hot", name: "HOT", icon: "📺", domains: ["hot.net.il", "hotmobile.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.hot.net.il/" },
  { key: "yes", name: "yes", icon: "📺", domains: ["yes.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.yes.co.il/" },
  { key: "bezeq", name: "Bezeq", icon: "☎️", domains: ["bezeq.co.il", "bezeqint.net"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.bezeq.co.il/" },
  { key: "golan", name: "Golan Telecom", icon: "📱", domains: ["golantelecom.co.il"], match: /חשבונית|חשבון|invoice|bill/i, cancel: "https://www.golantelecom.co.il/" },
];

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
