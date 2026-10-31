// Starting points for new spaces. Everything stays editable afterwards; a
// template only decides the layout, properties and starter items (with
// schedules for trackers).
//
// Defaults are deliberate:
// - Evening "streak" nudges only where missing a session matters (meds,
//   training, bills, workouts). Notification fatigue is why people mute apps.
// - Long-cycle items (every 14+ days) start a week out so nothing fires on
//   day one; tap an item to set its real date.
// - Grocery/restock staples are seeded as *done* so they sit in history and
//   come back with one tap, instead of cluttering the list.
import type { SectionView } from "@/lib/db-types";
import type { Locale } from "@/i18n";
import { addDays, type Habit } from "@/lib/engine/habits";
import { newPropertyId, type PropertyDef, type PropertyType } from "./properties";

type L = Record<Locale, string>;

export type TemplateCategory = "dog" | "home" | "family" | "memories" | "money" | "us" | "health" | "work" | "plan";

export const TEMPLATE_CATEGORIES: { key: TemplateCategory; icon: string; label: L }[] = [
  { key: "dog", icon: "🐶", label: { en: "Dog", he: "כלב" } },
  { key: "home", icon: "🏠", label: { en: "Home", he: "בית" } },
  { key: "family", icon: "🧒", label: { en: "Kids", he: "ילדים" } },
  { key: "memories", icon: "✨", label: { en: "Memories", he: "זיכרונות" } },
  { key: "money", icon: "💰", label: { en: "Money", he: "כסף" } },
  { key: "us", icon: "💑", label: { en: "Us", he: "זוגיות" } },
  { key: "health", icon: "💪", label: { en: "Health", he: "בריאות" } },
  { key: "work", icon: "💼", label: { en: "Work", he: "עבודה" } },
  { key: "plan", icon: "✈️", label: { en: "Plans", he: "תכנונים" } },
];

type Repeat =
  | { kind: "interval"; every: number }
  | { kind: "weekly"; days: number[] }
  | { kind: "monthly"; day: number; every?: number };

interface TemplateProp {
  key: string;
  name: L;
  type: PropertyType;
  options?: L[];
}

interface TemplateItem {
  title: L;
  /** Tracker schedule; time "HH:mm". */
  every?: Repeat;
  time?: string;
  nudge?: boolean;
  /** Outdoor session: reminders mention rain/heat. */
  outdoor?: boolean;
  done?: boolean;
  /** Values keyed by TemplateProp.key; select values are option indexes; a date "+N" is N days from today. */
  props?: Record<string, number | string>;
  /** "Spin the wheel" spaces: this item is a wheel with these options. */
  wheel?: { label: L; tag?: L }[];
}

export interface SectionTemplate {
  key: string;
  category: TemplateCategory;
  icon: string;
  color: string;
  view: SectionView;
  title: L;
  desc: L;
  shared?: boolean;
  props?: TemplateProp[];
  items?: TemplateItem[];
  /**
   * Ways to keep it, picked on the details step; each names the template it
   * creates (Get fit: a weekly plan or simple habits).
   */
  shapes?: { label: L; template: string }[];
  /**
   * Merged into another template: no longer offered in New space or Help me
   * choose, but spaces already made from it keep working (views, voices, money).
   */
  retired?: boolean;
}

const DAILY: Repeat = { kind: "interval", every: 1 };
const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];

export const SECTION_TEMPLATES: SectionTemplate[] = [
  // ---------------------------------------------------------------- Dog
  {
    key: "dog-care",
    category: "dog",
    icon: "🐶",
    color: "coral",
    view: "tracker",
    title: { en: "Dog care", he: "טיפול בכלב" },
    desc: { en: "Walks & meals — see who already did it, no double feeding.", he: "טיולים וארוחות — רואים מי כבר עשה, בלי להאכיל פעמיים." },
    items: [
      { title: { en: "Morning walk 🦮", he: "טיול בוקר 🦮" }, every: DAILY, time: "07:00", nudge: false, outdoor: true },
      { title: { en: "Breakfast 🥣", he: "ארוחת בוקר 🥣" }, every: DAILY, time: "08:00", nudge: true },
      { title: { en: "Evening walk 🌙", he: "טיול ערב 🌙" }, every: DAILY, time: "19:00", nudge: false, outdoor: true },
      { title: { en: "Dinner 🥣", he: "ארוחת ערב 🥣" }, every: DAILY, time: "18:00", nudge: true },
    ],
  },
  {
    key: "dog-vet",
    retired: true,
    category: "dog",
    icon: "💉",
    color: "sky",
    view: "dates",
    title: { en: "Vet & vaccines", he: "וטרינר וחיסונים" },
    desc: { en: "Vaccines, flea & tick, vet checkups — reminded ahead, then on the day.", he: "חיסונים, קרציות ופרעושים, ביקורת וטרינר — תזכורת מראש ואז ביום." },
    items: [
      { title: { en: "Rabies vaccine 💉", he: "חיסון כלבת 💉" } },
      { title: { en: "Flea & tick treatment 🪲", he: "טיפול נגד קרציות ופרעושים 🪲" } },
      { title: { en: "Yearly vet checkup 🩺", he: "בדיקה שנתית אצל וטרינר 🩺" } },
    ],
  },
  {
    key: "dog-training",
    category: "dog",
    icon: "🦴",
    color: "amber",
    view: "tracker",
    title: { en: "Dog training", he: "אילוף הכלב" },
    desc: { en: "Short daily sessions (5–10 min) beat long weekly ones. Build a streak!", he: "אימונים קצרים כל יום (5–10 דק׳) עדיפים על ארוכים פעם בשבוע. בונים רצף!" },
    items: [
      { title: { en: "Sit & stay (5 min)", he: "שב והישאר (5 דק׳)" }, every: DAILY, time: "18:30", nudge: true },
      { title: { en: "Recall — come! (5 min)", he: "קריאה — בוא! (5 דק׳)" }, every: { kind: "interval", every: 2 }, time: "18:30", nudge: true },
      { title: { en: "Loose-leash walking", he: "הליכה ברצועה רפויה" }, every: DAILY, time: "19:00", nudge: false, outdoor: true },
      { title: { en: "New trick 🎾", he: "טריק חדש 🎾" }, every: { kind: "interval", every: 3 }, time: "18:30", nudge: false },
    ],
  },
  {
    key: "dog-health",
    category: "dog",
    icon: "💉",
    color: "green",
    view: "tracker",
    title: { en: "Dog health", he: "בריאות הכלב" },
    desc: { en: "Easy-to-forget cycles. Tap each one to set its real next date.", he: "דברים שקל לשכוח. הקישו על כל אחד כדי לקבוע את התאריך הבא." },
    items: [
      { title: { en: "Flea & tick treatment", he: "טיפול נגד פרעושים וקרציות" }, every: { kind: "interval", every: 30 }, time: "09:00", nudge: true },
      { title: { en: "Deworming", he: "תילוע" }, every: { kind: "interval", every: 90 }, time: "09:00", nudge: true },
      { title: { en: "Vaccines (yearly)", he: "חיסונים (שנתי)" }, every: { kind: "interval", every: 365 }, time: "09:00", nudge: true },
      { title: { en: "Vet check-up", he: "בדיקה אצל הווטרינר" }, every: { kind: "interval", every: 365 }, time: "09:00", nudge: false },
      { title: { en: "Nail trim ✂️", he: "גזיזת ציפורניים ✂️" }, every: { kind: "interval", every: 21 }, time: "18:00", nudge: false },
      { title: { en: "Bath 🛁", he: "מקלחת 🛁" }, every: { kind: "interval", every: 30 }, time: "18:00", nudge: false },
      { title: { en: "Teeth brushing 🪥", he: "צחצוח שיניים 🪥" }, every: { kind: "interval", every: 2 }, time: "20:30", nudge: false },
    ],
  },
  {
    key: "dog-supplies",
    category: "dog",
    icon: "🛍️",
    color: "sky",
    view: "checklist",
    title: { en: "Dog supplies", he: "ציוד לכלב" },
    desc: { en: "Restock list — staples wait in history, one tap to re-add.", he: "רשימת השלמות — הקבועים מחכים בהיסטוריה, הקשה אחת להחזיר." },
    props: [{ key: "where", name: { en: "Where", he: "איפה" }, type: "select", options: [{ en: "Pet shop", he: "חנות חיות" }, { en: "Online", he: "אונליין" }, { en: "Vet", he: "וטרינר" }] }],
    items: [
      { title: { en: "Dog food", he: "אוכל לכלב" }, done: true, props: { where: 0 } },
      { title: { en: "Treats", he: "חטיפים" }, done: true, props: { where: 0 } },
      { title: { en: "Poop bags", he: "שקיות לקקי" }, done: true, props: { where: 1 } },
      { title: { en: "Flea & tick meds", he: "תרופה נגד פרעושים" }, done: true, props: { where: 2 } },
      { title: { en: "Shampoo", he: "שמפו" }, done: true, props: { where: 0 } },
      { title: { en: "Chew toys", he: "צעצועי לעיסה" }, done: true, props: { where: 1 } },
    ],
  },

  // ---------------------------------------------------------------- Home
  {
    key: "groceries",
    category: "home",
    icon: "🛒",
    color: "green",
    view: "checklist",
    title: { en: "Groceries", he: "קניות לסופר" },
    desc: { en: "Shared live list by aisle. Staples wait in history — tap to re-add.", he: "רשימה משותפת לפי מחלקות. הקבועים בהיסטוריה — הקשה להחזיר." },
    props: [
      {
        key: "aisle",
        name: { en: "Aisle", he: "מחלקה" },
        type: "select",
        options: [
          { en: "Produce", he: "ירקות ופירות" },
          { en: "Dairy", he: "מוצרי חלב" },
          { en: "Meat & fish", he: "בשר ודגים" },
          { en: "Bakery", he: "מאפים" },
          { en: "Pantry", he: "מזווה" },
          { en: "Frozen", he: "קפואים" },
          { en: "Drinks", he: "שתייה" },
          { en: "Household", he: "ניקיון ובית" },
        ],
      },
    ],
    items: [
      { title: { en: "Milk", he: "חלב" }, done: true, props: { aisle: 1 } },
      { title: { en: "Eggs", he: "ביצים" }, done: true, props: { aisle: 1 } },
      { title: { en: "Cottage cheese", he: "קוטג׳" }, done: true, props: { aisle: 1 } },
      { title: { en: "Bread", he: "לחם" }, done: true, props: { aisle: 3 } },
      { title: { en: "Tomatoes", he: "עגבניות" }, done: true, props: { aisle: 0 } },
      { title: { en: "Cucumbers", he: "מלפפונים" }, done: true, props: { aisle: 0 } },
      { title: { en: "Bananas", he: "בננות" }, done: true, props: { aisle: 0 } },
      { title: { en: "Chicken", he: "עוף" }, done: true, props: { aisle: 2 } },
      { title: { en: "Rice", he: "אורז" }, done: true, props: { aisle: 4 } },
      { title: { en: "Pasta", he: "פסטה" }, done: true, props: { aisle: 4 } },
      { title: { en: "Coffee", he: "קפה" }, done: true, props: { aisle: 4 } },
      { title: { en: "Toilet paper", he: "נייר טואלט" }, done: true, props: { aisle: 7 } },
      { title: { en: "Dish soap", he: "סבון כלים" }, done: true, props: { aisle: 7 } },
    ],
  },
  {
    key: "cleaning",
    category: "home",
    icon: "🧹",
    color: "sky",
    view: "tracker",
    title: { en: "Cleaning rotation", he: "סבב ניקיון" },
    desc: { en: "Flexible cycles, not a rigid schedule. You both see who did what.", he: "מחזורים גמישים, לא לו״ז נוקשה. שניכם רואים מי עשה מה." },
    items: [
      { title: { en: "Kitchen reset 🍽️", he: "סידור מטבח 🍽️" }, every: DAILY, time: "21:00", nudge: false },
      { title: { en: "Take out trash 🗑️", he: "להוציא זבל 🗑️" }, every: { kind: "interval", every: 2 }, time: "20:00", nudge: false },
      { title: { en: "Laundry 👕", he: "כביסה 👕" }, every: { kind: "interval", every: 3 }, time: "19:00", nudge: false },
      { title: { en: "Vacuum (dog hair!) 🐾", he: "שאיבת אבק (שיער כלב!) 🐾" }, every: { kind: "interval", every: 3 }, time: "18:00", nudge: false },
      { title: { en: "Mop floors", he: "שטיפת רצפה" }, every: { kind: "weekly", days: [5] }, time: "10:00", nudge: false },
      { title: { en: "Bathroom", he: "אמבטיה ושירותים" }, every: { kind: "weekly", days: [4] }, time: "19:00", nudge: false },
      { title: { en: "Change sheets 🛏️", he: "החלפת מצעים 🛏️" }, every: { kind: "interval", every: 14 }, time: "10:00", nudge: false },
      { title: { en: "Fridge clean-out", he: "ניקוי מקרר" }, every: { kind: "interval", every: 30 }, time: "18:00", nudge: false },
    ],
  },
  {
    key: "maintenance",
    category: "home",
    icon: "🔧",
    color: "violet",
    view: "tracker",
    title: { en: "Home maintenance", he: "תחזוקת הבית" },
    desc: { en: "The stuff nobody remembers until it breaks.", he: "הדברים שאף אחד לא זוכר עד שהם נשברים." },
    items: [
      { title: { en: "Clean AC filters", he: "ניקוי פילטרים במזגן" }, every: { kind: "interval", every: 90 }, time: "10:00" },
      { title: { en: "Replace water filter", he: "החלפת פילטר מים" }, every: { kind: "interval", every: 180 }, time: "10:00" },
      { title: { en: "Descale kettle", he: "ניקוי אבנית בקומקום" }, every: { kind: "interval", every: 30 }, time: "10:00" },
      { title: { en: "Clean washing machine", he: "ניקוי מכונת כביסה" }, every: { kind: "interval", every: 30 }, time: "10:00" },
      { title: { en: "Test smoke detector", he: "בדיקת גלאי עשן" }, every: { kind: "interval", every: 180 }, time: "10:00" },
      { title: { en: "Check water heater (dud)", he: "בדיקת דוד/בוילר" }, every: { kind: "interval", every: 365 }, time: "10:00" },
    ],
  },
  {
    key: "plants",
    category: "home",
    icon: "🪴",
    color: "green",
    view: "tracker",
    title: { en: "Plants", he: "צמחים" },
    desc: { en: "Water on a rhythm, not when they're already droopy.", he: "משקים בקצב קבוע, לא כשהם כבר נבולים." },
    items: [
      { title: { en: "Water indoor plants 💧", he: "השקיית צמחי בית 💧" }, every: { kind: "interval", every: 4 }, time: "08:30", nudge: false },
      { title: { en: "Water balcony 🌿", he: "השקיית מרפסת 🌿" }, every: { kind: "interval", every: 2 }, time: "19:30", nudge: false, outdoor: true },
      { title: { en: "Fertilize", he: "דישון" }, every: { kind: "interval", every: 30 }, time: "09:00" },
    ],
  },
  {
    key: "projects",
    category: "home",
    icon: "🛠️",
    color: "amber",
    view: "checklist",
    shared: true,
    title: { en: "House projects", he: "פרויקטים לבית" },
    desc: { en: "Fixes and upgrades with priority, cost and who's on it.", he: "תיקונים ושדרוגים עם עדיפות, עלות ומי אחראי." },
    props: [
      { key: "priority", name: { en: "Priority", he: "עדיפות" }, type: "select", options: [{ en: "🔴 Urgent", he: "🔴 דחוף" }, { en: "🟡 Soon", he: "🟡 בקרוב" }, { en: "🟢 Someday", he: "🟢 מתישהו" }] },
      { key: "cost", name: { en: "Cost", he: "עלות" }, type: "price" },
      { key: "who", name: { en: "Who", he: "מי" }, type: "person" },
      { key: "due", name: { en: "Due", he: "עד מתי" }, type: "date" },
    ],
    items: [
      { title: { en: "Fix dripping faucet", he: "לתקן ברז מטפטף" }, props: { priority: 1 } },
      { title: { en: "Hang pictures", he: "לתלות תמונות" }, props: { priority: 2 } },
    ],
  },
  {
    key: "documents",
    category: "home",
    icon: "📄",
    color: "violet",
    view: "list",
    title: { en: "Documents", he: "מסמכים" },
    desc: { en: "IDs, insurance, contracts, vet records — scanned, with expiry reminders.", he: "תעודות, ביטוחים, חוזים, תיק וטרינרי — סרוקים, עם תזכורת לתוקף." },
    props: [
      { key: "expires", name: { en: "Expires", he: "בתוקף עד" }, type: "date" },
      { key: "type", name: { en: "Type", he: "סוג" }, type: "select", options: [{ en: "ID / passport", he: "ת״ז / דרכון" }, { en: "Insurance", he: "ביטוח" }, { en: "Contract", he: "חוזה" }, { en: "Medical", he: "רפואי" }, { en: "Dog / vet", he: "כלב / וטרינר" }, { en: "Car", he: "רכב" }] },
    ],
    items: [
      { title: { en: "Passports", he: "דרכונים" }, props: { type: 0 } },
      { title: { en: "Rental contract", he: "חוזה שכירות" }, props: { type: 2 } },
      { title: { en: "Dog vaccination record", he: "פנקס חיסונים של הכלב" }, props: { type: 4 } },
    ],
  },
  // Israel: the safe room (ממ״ד) or shelter. Expiry heads-ups come from the daily job.
  {
    key: "shelter-kit",
    category: "home",
    icon: "🛡️",
    color: "green",
    view: "checklist",
    title: { en: "Shelter & emergency kit", he: "ממ״ד וערכת חירום" },
    desc: { en: "What the safe room needs, with expiry dates on water, batteries and meds. Heads-ups before anything runs out, and a full check every 6 months.", he: "מה שצריך בממ״ד, עם תוקף למים, סוללות ותרופות. תזכורת לפני שמשהו פג, ובדיקה מלאה כל חצי שנה." },
    props: [{ key: "expires", name: { en: "Expires", he: "בתוקף עד" }, type: "date" }],
    items: [
      { title: { en: "Full kit check ✅", he: "בדיקה מלאה של הערכה ✅" }, props: { expires: "+182" } },
      { title: { en: "Water: 3 L per person per day, for 3 days 💧", he: "מים: 3 ליטר לאדם ליום, ל־3 ימים 💧" } },
      { title: { en: "Canned and dry food", he: "שימורים ומזון יבש" } },
      { title: { en: "Flashlight and spare batteries 🔦", he: "פנס וסוללות רזרביות 🔦" } },
      { title: { en: "Charged power bank and cables 🔋", he: "סוללה ניידת טעונה וכבלים 🔋" } },
      { title: { en: "Battery radio 📻", he: "רדיו על סוללות 📻" } },
      { title: { en: "First-aid kit 🩹", he: "ערכת עזרה ראשונה 🩹" } },
      { title: { en: "Regular meds for a few days 💊", he: "תרופות קבועות לכמה ימים 💊" } },
      { title: { en: "Copies of IDs and documents", he: "צילומי תעודות ומסמכים" } },
      { title: { en: "Pet food, water and leash 🐾", he: "אוכל, מים ורצועה לחיות המחמד 🐾" } },
      { title: { en: "Chairs or mattresses, blankets", he: "כיסאות או מזרנים, שמיכות" } },
      { title: { en: "Something for the kids (games, snacks)", he: "משהו לילדים (משחקים, חטיפים)" } },
    ],
  },
  {
    key: "home-buy",
    category: "home",
    icon: "🎁",
    color: "pink",
    view: "list",
    title: { en: "To buy for home", he: "לקנות לבית" },
    desc: { en: "Wishlist with price and link — decide together.", he: "רשימת משאלות עם מחיר וקישור — מחליטים ביחד." },
    props: [
      { key: "price", name: { en: "Price", he: "מחיר" }, type: "price" },
      { key: "link", name: { en: "Link", he: "קישור" }, type: "url" },
      { key: "priority", name: { en: "Priority", he: "עדיפות" }, type: "select", options: [{ en: "Need", he: "צריך" }, { en: "Want", he: "רוצה" }] },
    ],
  },

  // ---------------------------------------------------------------- Memories
  {
    key: "recipes",
    category: "memories",
    icon: "🍝",
    color: "amber",
    view: "gallery",
    title: { en: "Recipes we love", he: "מתכונים שאהבנו" },
    desc: { en: "Snap the dish, rate it, keep the link. Your own cookbook.", he: "מצלמים את המנה, מדרגים, שומרים קישור. ספר המתכונים שלכם." },
    props: [
      { key: "date", name: { en: "Made on", he: "הוכן ב־" }, type: "date" },
      { key: "rating", name: { en: "Rating", he: "דירוג" }, type: "rating" },
      { key: "cuisine", name: { en: "Kind", he: "סוג" }, type: "select", options: [{ en: "Italian", he: "איטלקי" }, { en: "Asian", he: "אסייתי" }, { en: "Israeli", he: "ישראלי" }, { en: "Mexican", he: "מקסיקני" }, { en: "Baking & dessert", he: "אפייה וקינוחים" }, { en: "Quick weeknight", he: "מהיר לאמצע שבוע" }] },
      { key: "minutes", name: { en: "Minutes", he: "דקות" }, type: "number" },
      { key: "link", name: { en: "Recipe link", he: "קישור למתכון" }, type: "url" },
      { key: "cook", name: { en: "Chef", he: "השף/ית" }, type: "person" },
    ],
  },
  {
    key: "places",
    category: "memories",
    icon: "📍",
    color: "sky",
    view: "gallery",
    title: { en: "Places we went", he: "מקומות שהיינו" },
    desc: { en: "Restaurants, trips, beaches — with photos, rating and a map link.", he: "מסעדות, טיולים, חופים — עם תמונות, דירוג וקישור למפה." },
    props: [
      { key: "date", name: { en: "When", he: "מתי" }, type: "date" },
      { key: "rating", name: { en: "Rating", he: "דירוג" }, type: "rating" },
      { key: "type", name: { en: "Type", he: "סוג" }, type: "select", options: [{ en: "Restaurant", he: "מסעדה" }, { en: "Café", he: "בית קפה" }, { en: "Bar", he: "בר" }, { en: "Trip", he: "טיול" }, { en: "Nature", he: "טבע" }, { en: "Beach", he: "חוף" }, { en: "Dog-friendly 🐶", he: "ידידותי לכלבים 🐶" }] },
      { key: "where", name: { en: "Where", he: "איפה" }, type: "text" },
      { key: "map", name: { en: "Map link", he: "קישור למפה" }, type: "url" },
    ],
  },
  {
    key: "watched",
    retired: true,
    category: "memories",
    icon: "🎬",
    color: "violet",
    view: "gallery",
    title: { en: "Watched together", he: "ראינו ביחד" },
    desc: { en: "Movies, series and shows you watched — and how much you loved them.", he: "סרטים, סדרות והופעות שראיתם — וכמה אהבתם." },
    props: [
      { key: "date", name: { en: "Watched on", he: "ראינו ב־" }, type: "date" },
      { key: "rating", name: { en: "Rating", he: "דירוג" }, type: "rating" },
      { key: "type", name: { en: "Type", he: "סוג" }, type: "select", options: [{ en: "Movie", he: "סרט" }, { en: "Series", he: "סדרה" }, { en: "Show / concert", he: "הופעה" }] },
      { key: "where", name: { en: "Where", he: "איפה" }, type: "text" },
    ],
  },
  {
    key: "moments",
    category: "memories",
    icon: "🎉",
    color: "pink",
    view: "gallery",
    title: { en: "Our moments", he: "הרגעים שלנו" },
    desc: { en: "Fun things you did together. They come back on “On this day”.", he: "דברים כיפיים שעשיתם ביחד. הם חוזרים ב״ביום הזה״." },
    props: [
      { key: "date", name: { en: "When", he: "מתי" }, type: "date" },
      { key: "rating", name: { en: "Rating", he: "דירוג" }, type: "rating" },
      { key: "where", name: { en: "Where", he: "איפה" }, type: "text" },
    ],
  },

  // ---------------------------------------------------------------- Money
  {
    key: "bills",
    retired: true,
    category: "money",
    icon: "🧾",
    color: "violet",
    view: "tracker",
    title: { en: "Bills & payments", he: "חשבונות ותשלומים" },
    desc: { en: "Reminders on the real due date — no late fees. Set each day of month.", he: "תזכורת בתאריך האמיתי — בלי קנסות איחור. קבעו לכל אחד את היום בחודש." },
    items: [
      { title: { en: "Rent", he: "שכר דירה" }, every: { kind: "monthly", day: 1 }, time: "09:00", nudge: true },
      { title: { en: "Arnona (municipal tax)", he: "ארנונה" }, every: { kind: "monthly", day: 1, every: 2 }, time: "09:00", nudge: true },
      { title: { en: "Electricity", he: "חשמל" }, every: { kind: "monthly", day: 15, every: 2 }, time: "09:00", nudge: true },
      { title: { en: "Water", he: "מים" }, every: { kind: "monthly", day: 15, every: 2 }, time: "09:00", nudge: true },
      { title: { en: "Internet & phones", he: "אינטרנט וטלפונים" }, every: { kind: "monthly", day: 10 }, time: "09:00", nudge: false },
      { title: { en: "Credit card statement", he: "פירוט כרטיס אשראי" }, every: { kind: "monthly", day: 10 }, time: "20:00", nudge: false },
      { title: { en: "Pet insurance", he: "ביטוח לכלב" }, every: { kind: "monthly", day: 1, every: 12 }, time: "09:00", nudge: true },
    ],
  },
  {
    key: "receipts",
    category: "money",
    icon: "🧾",
    color: "green",
    view: "list",
    title: { en: "Receipts & warranties", he: "קבלות ואחריות" },
    desc: { en: "Snap the receipt and set the warranty end: a heads-up 60, 30 and 7 days before it runs out, with the model and who repairs it.", he: "מצלמים את הקבלה וקובעים מתי נגמרת האחריות: תזכורת 60, 30 ו־7 ימים לפני, עם הדגם ומי מתקן." },
    props: [
      { key: "warranty", name: { en: "Warranty until", he: "אחריות עד" }, type: "date" },
      { key: "amount", name: { en: "Amount", he: "סכום" }, type: "price" },
      { key: "store", name: { en: "Store", he: "חנות" }, type: "text" },
      { key: "bought", name: { en: "Bought on", he: "נקנה ב־" }, type: "date" },
      { key: "model", name: { en: "Model / serial", he: "דגם / מספר סידורי" }, type: "text" },
      { key: "repair", name: { en: "Repair contact", he: "איש תיקונים / מעבדה" }, type: "text" },
    ],
  },
  {
    key: "savings",
    category: "money",
    icon: "🐷",
    color: "pink",
    view: "list",
    title: { en: "Savings goals", he: "יעדי חיסכון" },
    desc: { en: "What you're saving for, how much, and by when.", he: "למה חוסכים, כמה, ועד מתי." },
    props: [
      { key: "target", name: { en: "Target", he: "יעד" }, type: "price" },
      { key: "saved", name: { en: "Saved so far", he: "נחסך עד כה" }, type: "price" },
      { key: "by", name: { en: "By", he: "עד" }, type: "date" },
    ],
    items: [
      { title: { en: "Emergency fund", he: "קרן חירום" } },
      { title: { en: "Vacation ✈️", he: "חופשה ✈️" } },
    ],
  },

  // ---------------------------------------------------------------- Us
  {
    key: "us",
    category: "us",
    icon: "💑",
    color: "pink",
    view: "tracker",
    title: { en: "Us", he: "אנחנו" },
    desc: { en: "Small rituals that keep a couple close.", he: "טקסים קטנים ששומרים על קרבה." },
    items: [
      { title: { en: "Date night 🍷", he: "ערב דייט 🍷" }, every: { kind: "weekly", days: [4] }, time: "20:00", nudge: false },
      { title: { en: "Weekly check-in (15 min) 💬", he: "שיחת שבוע (15 דק׳) 💬" }, every: { kind: "weekly", days: [0] }, time: "21:00", nudge: true },
      { title: { en: "Phone-free dinner 📵", he: "ארוחת ערב בלי טלפונים 📵" }, every: { kind: "interval", every: 2 }, time: "19:30", nudge: false },
    ],
  },
  {
    key: "date-ideas",
    category: "us",
    icon: "🌹",
    color: "coral",
    view: "list",
    title: { en: "Date ideas", he: "רעיונות לדייטים" },
    desc: { en: "Capture ideas when you hear them; pick one on date night.", he: "רושמים רעיונות כשעולים; בוחרים אחד בערב הדייט." },
    props: [{ key: "type", name: { en: "Type", he: "סוג" }, type: "select", options: [{ en: "Out", he: "בחוץ" }, { en: "Home", he: "בבית" }, { en: "With the dog", he: "עם הכלב" }] }],
    items: [
      { title: { en: "Sunset picnic at the beach", he: "פיקניק שקיעה בים" }, props: { type: 2 } },
      { title: { en: "Cook a new recipe together", he: "לבשל מתכון חדש ביחד" }, props: { type: 1 } },
      { title: { en: "Try a new restaurant", he: "לנסות מסעדה חדשה" }, props: { type: 0 } },
    ],
  },
  {
    key: "gifts",
    retired: true,
    category: "us",
    icon: "🎂",
    color: "amber",
    view: "list",
    title: { en: "Gifts & special dates", he: "מתנות ותאריכים חשובים" },
    desc: { en: "Birthdays, anniversaries and gift ideas — dates go to your calendar.", he: "ימי הולדת, ימי נישואין ורעיונות למתנות — התאריכים נכנסים ליומן." },
    props: [
      { key: "for", name: { en: "For", he: "בשביל" }, type: "text" },
      { key: "date", name: { en: "Date", he: "תאריך" }, type: "date" },
      { key: "price", name: { en: "Price", he: "מחיר" }, type: "price" },
      { key: "link", name: { en: "Link", he: "קישור" }, type: "url" },
    ],
    items: [{ title: { en: "Our anniversary 💍", he: "יום הנישואין שלנו 💍" } }],
  },
  {
    key: "watch",
    category: "us",
    icon: "🎬",
    color: "violet",
    view: "checklist",
    title: { en: "Watch & read", he: "לראות ולקרוא" },
    desc: { en: "Movies, series and books you want to get to. Tick one off when it's watched, with the date and how much you loved it.", he: "סרטים, סדרות וספרים שרוצים להגיע אליהם. מסמנים כשראיתם, עם התאריך וכמה אהבתם." },
    props: [
      { key: "type", name: { en: "Type", he: "סוג" }, type: "select", options: [{ en: "Movie", he: "סרט" }, { en: "Series", he: "סדרה" }, { en: "Book", he: "ספר" }, { en: "Show / concert", he: "הופעה" }] },
      { key: "date", name: { en: "Watched on", he: "ראינו ב־" }, type: "date" },
      { key: "rating", name: { en: "Rating", he: "דירוג" }, type: "rating" },
    ],
  },

  // ---------------------------------------------------------------- Health
  {
    key: "meds",
    category: "health",
    icon: "💊",
    color: "sky",
    view: "tracker",
    title: { en: "Vitamins & meds", he: "ויטמינים ותרופות" },
    desc: { en: "Where reminders help most. Evening nudge if you forgot.", he: "המקום שבו תזכורות הכי עוזרות. תזכורת ערב אם שכחתם." },
    shared: false,
    items: [
      { title: { en: "Vitamins 💊", he: "ויטמינים 💊" }, every: DAILY, time: "09:00", nudge: true },
      { title: { en: "Drink water 💧", he: "לשתות מים 💧" }, every: DAILY, time: "12:00", nudge: false },
    ],
  },
  {
    key: "fitness",
    retired: true,
    category: "health",
    icon: "🏋️",
    color: "coral",
    view: "tracker",
    title: { en: "Fitness", he: "כושר" },
    desc: { en: "Workouts on set days + a daily stretch. Streaks keep you going.", he: "אימונים בימים קבועים + מתיחות יומיות. הרצף ממשיך אתכם." },
    shared: false,
    items: [
      { title: { en: "Workout 💪", he: "אימון 💪" }, every: { kind: "weekly", days: [0, 2, 4] }, time: "18:30", nudge: true },
      { title: { en: "Stretch (5 min) 🧘", he: "מתיחות (5 דק׳) 🧘" }, every: DAILY, time: "07:30", nudge: false },
      { title: { en: "Long walk with the dog 🐕", he: "הליכה ארוכה עם הכלב 🐕" }, every: { kind: "weekly", days: [5] }, time: "08:00", nudge: false, outdoor: true },
    ],
  },
  {
    key: "checkups",
    category: "health",
    icon: "🩺",
    color: "green",
    view: "tracker",
    title: { en: "Check-ups", he: "בדיקות תקופתיות" },
    desc: { en: "Dentist, eye exam, blood tests — set the real next dates.", he: "שיניים, עיניים, בדיקות דם — קבעו את התאריכים הבאים." },
    shared: false,
    items: [
      { title: { en: "Dentist 🦷", he: "רופא שיניים 🦷" }, every: { kind: "interval", every: 180 }, time: "10:00" },
      { title: { en: "Blood test 🩸", he: "בדיקת דם 🩸" }, every: { kind: "interval", every: 365 }, time: "08:00" },
      { title: { en: "Eye exam 👓", he: "בדיקת עיניים 👓" }, every: { kind: "interval", every: 365 }, time: "10:00" },
    ],
  },

  // ---------------------------------------------------------------- Work
  {
    key: "business-launch",
    category: "work",
    icon: "🚀",
    color: "violet",
    view: "checklist",
    shared: false,
    title: { en: "Side business: launch", he: "עסק צדדי: פתיחה" },
    desc: { en: "Starting a business or side gig: each step with its status and deadline.", he: "פותחים עסק או עסק צדדי: כל שלב עם סטטוס ודדליין." },
    props: [
      { key: "status", name: { en: "Status", he: "סטטוס" }, type: "select", options: [{ en: "To do", he: "לעשות" }, { en: "Doing", he: "בתהליך" }, { en: "Waiting", he: "מחכה" }] },
      { key: "due", name: { en: "Due", he: "עד מתי" }, type: "date" },
    ],
    items: [
      { title: { en: "Register the business (osek)", he: "פתיחת תיק עוסק" }, props: { status: 0 } },
      { title: { en: "Find an accountant", he: "למצוא רואה חשבון" }, props: { status: 0 } },
      { title: { en: "Open a business bank account", he: "לפתוח חשבון בנק עסקי" }, props: { status: 0 } },
      { title: { en: "Logo & brand", he: "לוגו ומיתוג" }, props: { status: 0 } },
      { title: { en: "Price list", he: "מחירון" }, props: { status: 0 } },
      { title: { en: "Instagram & Facebook page", he: "עמוד אינסטגרם ופייסבוק" }, props: { status: 0 } },
      { title: { en: "Website / landing page", he: "אתר / דף נחיתה" }, props: { status: 0 } },
      { title: { en: "List of first 10 customers", he: "רשימת 10 הלקוחות הראשונים" }, props: { status: 0 } },
    ],
  },
  {
    key: "business-routine",
    category: "work",
    icon: "📈",
    color: "sky",
    view: "tracker",
    shared: false,
    title: { en: "Side business: routines", he: "עסק צדדי: שגרה" },
    desc: { en: "Consistency wins: content, follow-ups, books and a weekly review.", he: "עקביות מנצחת: תוכן, פולואפים, הנהלת חשבונות וסיכום שבועי." },
    items: [
      { title: { en: "Post content 📸", he: "פוסט ברשתות 📸" }, every: { kind: "interval", every: 2 }, time: "10:00", nudge: true },
      { title: { en: "Follow up leads 📞", he: "פולואפ ללידים 📞" }, every: { kind: "interval", every: 3 }, time: "11:00", nudge: false },
      { title: { en: "Invoices & expenses 🧾", he: "חשבוניות והוצאות 🧾" }, every: { kind: "weekly", days: [4] }, time: "16:00", nudge: true },
      { title: { en: "Weekly review & plan 🗓️", he: "סיכום ותכנון שבועי 🗓️" }, every: { kind: "weekly", days: [0] }, time: "09:00", nudge: true },
    ],
  },

  // Israeli self-employed calendar; items start undated so each sets its own cycle.
  {
    key: "business-admin",
    category: "work",
    icon: "🧾",
    color: "green",
    view: "dates",
    shared: false,
    title: { en: "Business admin", he: "ניהול העסק" },
    desc: { en: "VAT, income-tax advances, Bituach Leumi and the yearly report, each nagging on its day until it's filed. Plus invoices still unpaid.", he: "מע״מ, מקדמות מס הכנסה, ביטוח לאומי והדוח השנתי, כל אחד מזכיר ביום שלו עד שמגישים. וגם חשבוניות שעוד לא שולמו." },
    items: [
      { title: { en: "VAT report (every 1–2 months, by the 15th)", he: "דיווח מע״מ (כל חודש או חודשיים, עד ה־15)" } },
      { title: { en: "Income-tax advance (מקדמות)", he: "מקדמות מס הכנסה" } },
      { title: { en: "Bituach Leumi payment", he: "תשלום ביטוח לאומי" } },
      { title: { en: "Yearly report to the accountant", he: "דוח שנתי לרואה החשבון" } },
      { title: { en: "Send this month's invoices", he: "לשלוח את החשבוניות של החודש" } },
      { title: { en: "Chase unpaid invoices", he: "לגבות חשבוניות שלא שולמו" } },
    ],
  },

  // ---------------------------------------------------------------- Kids
  {
    key: "kids",
    category: "family",
    icon: "🧒",
    color: "amber",
    view: "tracker",
    title: { en: "Kids' week", he: "השבוע של הילדים" },
    desc: { en: "Pick-ups from activities, homework, bags and lunchboxes. Set who does each day.", he: "איסוף מחוגים, שיעורי בית, תיקים וקופסאות אוכל. קובעים מי עושה בכל יום." },
    items: [
      { title: { en: "Pick up from the activity (חוג) 🚸", he: "איסוף מהחוג 🚸" }, every: { kind: "weekly", days: [0, 2] }, time: "16:30", nudge: true },
      { title: { en: "Homework check ✏️", he: "בדיקת שיעורי בית ✏️" }, every: { kind: "weekly", days: [0, 1, 2, 3, 4] }, time: "17:30", nudge: false },
      { title: { en: "Pack the school bag 🎒", he: "להכין תיק לבית הספר 🎒" }, every: { kind: "weekly", days: [0, 1, 2, 3, 4] }, time: "20:00", nudge: false },
      { title: { en: "Lunchbox 🥪", he: "קופסת אוכל 🥪" }, every: { kind: "weekly", days: [0, 1, 2, 3, 4] }, time: "07:00", nudge: false },
    ],
  },
  {
    key: "kids-admin",
    category: "family",
    icon: "🏫",
    color: "sky",
    view: "dates",
    title: { en: "School & health", he: "בית ספר ובריאות" },
    desc: { en: "Tipat Halav vaccines, school forms and payments, parent meetings, trips. Each reminds on its day.", he: "חיסונים בטיפת חלב, טפסים ותשלומים לבית הספר, אסיפות הורים וטיולים. כל אחד מזכיר ביום שלו." },
    items: [
      { title: { en: "Tipat Halav vaccine appointment 💉", he: "תור לחיסון בטיפת חלב 💉" } },
      { title: { en: "School payments (תשלומי הורים)", he: "תשלומי הורים" } },
      { title: { en: "Sign school forms", he: "לחתום על טפסים לבית הספר" } },
      { title: { en: "Parent-teacher meeting", he: "אסיפת הורים" } },
      { title: { en: "School trip: payment and gear", he: "טיול שנתי: תשלום וציוד" } },
      { title: { en: "Dentist for the kids 🦷", he: "רופא שיניים לילדים 🦷" } },
    ],
  },

  // ---------------------------------------------------------------- Plans
  {
    key: "reserve-duty",
    category: "plan",
    icon: "🪖",
    color: "green",
    view: "checklist",
    title: { en: "Reserve duty (מילואים)", he: "מילואים" },
    desc: { en: "Before, during and after a call-up: what home needs while one of you is away, and the forms that pay you back.", he: "לפני, במהלך ואחרי צו: מה הבית צריך כשאחד מכם לא כאן, והטפסים שמחזירים כסף." },
    props: [
      { key: "who", name: { en: "Who", he: "מי" }, type: "person" },
      { key: "due", name: { en: "By", he: "עד מתי" }, type: "date" },
    ],
    items: [
      { title: { en: "Dates of the call-up (צו 8 / scheduled)", he: "תאריכי הצו (צו 8 / מתוכנן)" } },
      { title: { en: "Tell work and the manager", he: "לעדכן את העבודה ואת המנהל/ת" } },
      { title: { en: "Who takes the dog, the car, the bills while away", he: "מי לוקח את הכלב, הרכב והחשבונות בזמן ההיעדרות" } },
      { title: { en: "Help lined up for the partner at home (family, friends)", he: "עזרה לבן/בת הזוג בבית (משפחה, חברים)" } },
      { title: { en: "Pack: charger, meds, warm clothes", he: "לארוז: מטען, תרופות, בגדים חמים" } },
      { title: { en: "Bituach Leumi compensation form (תגמולים)", he: "טופס תגמולים לביטוח לאומי" } },
      { title: { en: "Reservist grants and benefits to claim", he: "מענקים והטבות למשרתי מילואים" } },
      { title: { en: "Self-employed: compensation for the business", he: "עצמאים: פיצוי לעסק" } },
    ],
  },
  {
    key: "packing",
    category: "plan",
    icon: "🧳",
    color: "sky",
    view: "checklist",
    title: { en: "Trip packing", he: "רשימת אריזה" },
    desc: { en: "Reusable packing list — including everything for the dog.", he: "רשימת אריזה לשימוש חוזר — כולל הכול לכלב." },
    props: [{ key: "who", name: { en: "Who packs", he: "מי אורז" }, type: "person" }],
    items: [
      { title: { en: "Passports / IDs 🛂", he: "דרכונים / תעודות 🛂" } },
      { title: { en: "Chargers & power bank 🔌", he: "מטענים וסוללה ניידת 🔌" } },
      { title: { en: "Meds 💊", he: "תרופות 💊" } },
      { title: { en: "Toiletries", he: "כלי רחצה" } },
      { title: { en: "Dog sitter / pension booked 🐶", he: "סידור לכלב / פנסיון 🐶" } },
      { title: { en: "Dog food, bowl & leash", he: "אוכל, קערה ורצועה לכלב" } },
      { title: { en: "Turn off water heater & AC", he: "לכבות דוד ומזגן" } },
      { title: { en: "Take out the trash", he: "להוציא את הזבל" } },
    ],
  },
  // Today offers one 21 days before a chag (lib/holidays), named for it.
  {
    key: "holidays",
    category: "plan",
    icon: "🕯️",
    color: "amber",
    view: "checklist",
    title: { en: "Holidays & hosting", he: "חגים ואירוח" },
    desc: { en: "Who's coming, who brings what, the menu and the cleaning, room by room. One per holiday.", he: "מי מגיע, מי מביא מה, התפריט והניקיון חדר אחר חדר. אחד לכל חג." },
    props: [
      { key: "kind", name: { en: "Kind", he: "סוג" }, type: "select", options: [{ en: "Guests", he: "אורחים" }, { en: "Bringing", he: "מביאים" }, { en: "Menu", he: "תפריט" }, { en: "Cleaning", he: "ניקיון" }, { en: "To buy", he: "לקנות" }] },
      { key: "who", name: { en: "Who", he: "מי" }, type: "person" },
    ],
    items: [
      { title: { en: "Guest list: who's coming?", he: "רשימת אורחים: מי מגיע?" }, props: { kind: 0 } },
      { title: { en: "Who brings dessert / wine", he: "מי מביא קינוח / יין" }, props: { kind: 1 } },
      { title: { en: "Main course", he: "מנה עיקרית" }, props: { kind: 2 } },
      { title: { en: "Sides and salads", he: "תוספות וסלטים" }, props: { kind: 2 } },
      { title: { en: "Kitchen", he: "מטבח" }, props: { kind: 3 } },
      { title: { en: "Living room", he: "סלון" }, props: { kind: 3 } },
      { title: { en: "Extra chairs and plates", he: "כיסאות וצלחות נוספים" }, props: { kind: 4 } },
    ],
  },
  {
    key: "moving",
    category: "plan",
    icon: "📦",
    color: "amber",
    view: "checklist",
    title: { en: "Moving", he: "מעבר דירה" },
    desc: { en: "Everything a move in Israel needs, from moving the arnona to forwarding the mail. Give each step a who and a date.", he: "כל מה שמעבר דירה בישראל דורש, מהעברת הארנונה ועד הפניית הדואר. לכל שלב מי ועד מתי." },
    props: [
      { key: "who", name: { en: "Who", he: "מי" }, type: "person" },
      { key: "due", name: { en: "By", he: "עד מתי" }, type: "date" },
    ],
    items: [
      { title: { en: "Book movers / van 🚚", he: "להזמין מובילים / משאית 🚚" } },
      { title: { en: "Boxes, tape and markers", he: "קרטונים, סלוטייפ וטושים" } },
      { title: { en: "Meter photos on the last day (electricity, water, gas) 📸", he: "צילום מונים ביום האחרון (חשמל, מים, גז) 📸" } },
      { title: { en: "Move electricity to your name (IEC)", he: "העברת חשמל על שמכם (חברת החשמל)" } },
      { title: { en: "Move water to your name", he: "העברת מים על שמכם (תאגיד המים)" } },
      { title: { en: "Arnona: close the old address, open the new one", he: "ארנונה: סגירה בכתובת הישנה ופתיחה בחדשה" } },
      { title: { en: "Gas supplier", he: "ספק גז" } },
      { title: { en: "Move internet & TV (book the technician early)", he: "העברת אינטרנט וטלוויזיה (לתאם טכנאי מוקדם)" } },
      { title: { en: "Change address at the Population Authority (משרד הפנים)", he: "שינוי כתובת במשרד הפנים" } },
      { title: { en: "Update the bank, Kupat Holim and insurance", he: "עדכון כתובת בבנק, בקופת חולים ובביטוחים" } },
      { title: { en: "Forward mail (Israel Post)", he: "הפניית דואר (דואר ישראל)" } },
      { title: { en: "Building committee (ועד בית) contact", he: "פרטי ועד הבית" } },
      { title: { en: "Change locks / copy keys 🔑", he: "החלפת מנעול / שכפול מפתחות 🔑" } },
      { title: { en: "Return the old keys and get the deposit back", he: "להחזיר מפתחות ולקבל את הפיקדון/צ׳ק ביטחון" } },
    ],
  },
  {
    key: "meals",
    retired: true,
    category: "plan",
    icon: "🍳",
    color: "amber",
    view: "list",
    title: { en: "Meal plan", he: "תכנון ארוחות" },
    desc: { en: "Plan the week's dinners on Sunday; who cooks what.", he: "מתכננים את ארוחות השבוע ביום ראשון; מי מבשל מה." },
    props: [
      {
        key: "day",
        name: { en: "Day", he: "יום" },
        type: "select",
        options: [
          { en: "Sun", he: "א׳" },
          { en: "Mon", he: "ב׳" },
          { en: "Tue", he: "ג׳" },
          { en: "Wed", he: "ד׳" },
          { en: "Thu", he: "ה׳" },
          { en: "Fri", he: "ו׳" },
          { en: "Sat", he: "ש׳" },
        ],
      },
      { key: "cook", name: { en: "Cook", he: "מבשל/ת" }, type: "person" },
      { key: "recipe", name: { en: "Recipe", he: "מתכון" }, type: "url" },
    ],
  },

  // ---------------------------------------------------------------- Reminder calendars
  // Items start without a date: tap one to set it (birthdays differ per family).
  {
    key: "important-dates",
    category: "us",
    icon: "🎂",
    color: "pink",
    view: "dates",
    title: { en: "Dates & gifts", he: "תאריכים ומתנות" },
    desc: { en: "Birthdays & anniversaries every year. Jot gift ideas on each date during the year; the heads-up a week before lists them.", he: "ימי הולדת וימי נישואין כל שנה. רושמים רעיונות למתנה על כל תאריך במהלך השנה, והתזכורת שבוע לפני מזכירה אותם." },
    items: [
      { title: { en: "Partner's birthday 🎂", he: "יום הולדת לבן/בת הזוג 🎂" } },
      { title: { en: "Our anniversary 💍", he: "יום הנישואין שלנו 💍" } },
      { title: { en: "Mom's birthday", he: "יום הולדת לאמא" } },
      { title: { en: "Dad's birthday", he: "יום הולדת לאבא" } },
      { title: { en: "The dog's birthday 🐶", he: "יום הולדת לכלב 🐶" } },
    ],
  },
  {
    key: "renewals",
    retired: true,
    category: "money",
    icon: "🧾",
    color: "amber",
    view: "dates",
    title: { en: "Bills & renewals", he: "חשבונות וחידושים" },
    desc: { en: "Insurance, car test, passports — nags on the day until it's handled.", he: "ביטוחים, טסט, דרכונים — מזכיר ביום עצמו עד שמטפלים." },
    items: [
      { title: { en: "Car insurance renewal 🚗", he: "חידוש ביטוח רכב 🚗" } },
      { title: { en: "Car test (annual)", he: "טסט לרכב" } },
      { title: { en: "Home insurance", he: "ביטוח דירה" } },
      { title: { en: "Passports expire 🛂", he: "תוקף דרכונים 🛂" } },
      { title: { en: "Dog's rabies vaccine 💉", he: "חיסון כלבת לכלב 💉" } },
    ],
  },
  // Undated on purpose: tap each to set the real date (and repeat yearly).
  {
    key: "car",
    category: "home",
    icon: "🚗",
    color: "sky",
    view: "dates",
    title: { en: "Car", he: "רכב" },
    desc: { en: "Annual test, insurance, licence and service: nags on the day until it's handled. Fines too, with their pay-by date.", he: "טסט שנתי, ביטוחים, רישיון וטיפול: מזכיר ביום עצמו עד שמטפלים. גם דוחות, עם תאריך התשלום." },
    items: [
      { title: { en: "Annual test (טסט)", he: "טסט שנתי" } },
      { title: { en: "Mandatory insurance (חובה)", he: "ביטוח חובה" } },
      { title: { en: "Comprehensive / third-party insurance", he: "ביטוח מקיף / צד ג׳" } },
      { title: { en: "Vehicle licence renewal", he: "חידוש רישיון רכב" } },
      { title: { en: "Driving licence renewal", he: "חידוש רישיון נהיגה" } },
      { title: { en: "Service (every 12 months or 15,000 km) 🔧", he: "טיפול (כל 12 חודשים או 15,000 ק״מ) 🔧" } },
      { title: { en: "Tyre pressure check", he: "בדיקת לחץ אוויר בצמיגים" } },
      { title: { en: "Parking / traffic fine: pay by", he: "דוח חניה / תנועה: לשלם עד" } },
    ],
  },
  // Bills and subscriptions in one place (it replaced the Bills & payments and Bills &
// renewals templates). Filled from Gmail or by hand; private, since it reads one person's inbox.
  {
    key: "subscriptions",
    category: "money",
    icon: "💳",
    color: "green",
    view: "subscriptions",
    title: { en: "Bills & subscriptions", he: "חשבונות ומנויים" },
    desc: { en: "Electricity, arnona, water, phone and every subscription: what each costs a month, when it's due, and where to cancel. Add by hand or connect Gmail.", he: "חשמל, ארנונה, מים, טלפון וכל המנויים: כמה כל אחד עולה בחודש, מתי משלמים ואיפה מבטלים. מוסיפים ידנית או מחברים Gmail." },
    shared: false,
  },
  {
    key: "appointments",
    category: "health",
    icon: "🩺",
    color: "sky",
    view: "dates",
    title: { en: "Appointments", he: "תורים" },
    desc: { en: "Doctor, dentist, vet — a heads-up the day before, then on the day.", he: "רופא, שיניים, וטרינר — תזכורת יום לפני ואז ביום עצמו." },
    items: [{ title: { en: "Dentist checkup 🦷", he: "בדיקה אצל רופא שיניים 🦷" } }],
  },

  // Things we said we'd do, checked at the end of their hour / day / week / month / year.
  {
    key: "commitments",
    category: "us",
    icon: "🤝",
    color: "green",
    view: "commit",
    title: { en: "Commitments", he: "התחייבויות" },
    desc: { en: "\"Under ₪300 on Cibus this month\", \"laundry today\" — at the end you find out if you made it, with a scoreboard.", he: "\"עד 300 ₪ בסיבוס החודש\", \"כביסה היום\" — בסוף מגלים אם עמדתם בזה, עם לוח תוצאות." },
  },
  // A goal over weeks with planned sessions, a real log of each one, the partner
  // watching, and a stake for a missed week.
  {
    key: "training",
    category: "health",
    icon: "🏋️",
    color: "coral",
    view: "plan",
    title: { en: "Get fit", he: "להיכנס לכושר" },
    desc: { en: "A weekly training plan with a real log of what you lifted or ran, or just simple workout habits with streaks. You choose.", he: "תוכנית אימונים שבועית עם תיעוד של מה שבאמת הרמתם או רצתם, או פשוט הרגלי אימון עם רצף. אתם בוחרים." },
    shapes: [
      { label: { en: "📋 Weekly plan", he: "📋 תוכנית שבועית" }, template: "training" },
      { label: { en: "✅ Simple habits", he: "✅ הרגלים פשוטים" }, template: "fitness" },
    ],
  },
  {
    key: "goals",
    category: "plan",
    icon: "🎯",
    color: "violet",
    view: "plan",
    title: { en: "Goals", he: "יעדים" },
    desc: { en: "Study 4× a week, read, train the dog — a plan for each, a log of what you did, weekly results your partner sees.", he: "ללמוד 4 פעמים בשבוע, לקרוא, לאלף את הכלב — תוכנית לכל אחד, תיעוד של מה שעשיתם, ותוצאה שבועית שגם הבן/בת זוג רואים." },
  },
  // A photo of the fridge becomes the inventory; staples running out go on the shopping list.
  {
    key: "fridge",
    category: "home",
    icon: "🧊",
    color: "sky",
    view: "fridge",
    title: { en: "Fridge", he: "מקרר" },
    desc: { en: "Snap the fridge: see what you have, and what's running out goes on the shopping list.", he: "מצלמים את המקרר: רואים מה יש, ומה שנגמר עובר לרשימת הקניות." },
  },
  // Card purchases forwarded from the bank's texts by an iPhone automation.
  {
    key: "spending",
    category: "money",
    icon: "💸",
    color: "green",
    view: "spend",
    title: { en: "Spending", he: "הוצאות" },
    desc: { en: "Every Max / bank purchase shows up by itself, sorted by category, with the month's total.", he: "כל קנייה במקס או בבנק מופיעה לבד, לפי קטגוריות, עם הסיכום החודשי." },
  },
  // Several saved wheels in one space; pick one and spin.
  {
    key: "wheels",
    category: "us",
    icon: "🎡",
    color: "pink",
    view: "wheel",
    title: { en: "Spin the wheel", he: "גלגל מזל" },
    desc: { en: "Can't decide? Wheels for food, movies, date nights — add your own options and spin.", he: "לא מצליחים להחליט? גלגלים לאוכל, סרטים, דייטים — מוסיפים אפשרויות ומסובבים." },
    items: [
      { title: { en: "Dinner 🍽️", he: "ארוחת ערב 🍽️" }, wheel: [{ label: { en: "Pizza", he: "פיצה" }, tag: { en: "Order in", he: "משלוח" } }, { label: { en: "Sushi", he: "סושי" }, tag: { en: "Order in", he: "משלוח" } }, { label: { en: "Burgers", he: "המבורגר" }, tag: { en: "Out", he: "בחוץ" } }, { label: { en: "Shakshuka", he: "שקשוקה" }, tag: { en: "Home", he: "בבית" } }, { label: { en: "Pasta", he: "פסטה" }, tag: { en: "Home", he: "בבית" } }, { label: { en: "Hummus place", he: "חומוסייה" }, tag: { en: "Out", he: "בחוץ" } }] },
      { title: { en: "Movie night 🎬", he: "ערב סרט 🎬" }, wheel: [{ label: { en: "Comedy", he: "קומדיה" } }, { label: { en: "Thriller", he: "מותחן" } }, { label: { en: "Rom-com", he: "קומדיה רומנטית" } }, { label: { en: "Animation", he: "אנימציה" } }, { label: { en: "Documentary", he: "דוקו" } }, { label: { en: "Rewatch a favourite", he: "סרט אהוב שוב" } }] },
      { title: { en: "Date night 💞", he: "דייט 💞" }, wheel: [{ label: { en: "Picnic at sunset", he: "פיקניק בשקיעה" }, tag: { en: "Outdoor", he: "בחוץ" } }, { label: { en: "Cook together", he: "מבשלים יחד" }, tag: { en: "Home", he: "בבית" } }, { label: { en: "Bar & live music", he: "בר והופעה" }, tag: { en: "Out", he: "בחוץ" } }, { label: { en: "Board games", he: "משחקי קופסה" }, tag: { en: "Home", he: "בבית" } }, { label: { en: "Beach walk", he: "הליכה בחוף" }, tag: { en: "Outdoor", he: "בחוץ" } }, { label: { en: "New restaurant", he: "מסעדה חדשה" }, tag: { en: "Out", he: "בחוץ" } }] },
      { title: { en: "Who does it? 🙋", he: "מי עושה? 🙋" }, wheel: [{ label: { en: "Me", he: "אני" } }, { label: { en: "You", he: "את/ה" } }, { label: { en: "Together", he: "ביחד" } }] },
    ],
  },

  // ---------------------------------------------------------------- Blank
  { key: "blank", category: "home", icon: "📄", color: "coral", view: "list", title: { en: "", he: "" }, desc: { en: "Start from scratch.", he: "מתחילים מאפס." } },
];

/** Templates offered when making a new space (everything not retired). */
export const LIVE_TEMPLATES: SectionTemplate[] = SECTION_TEMPLATES.filter((t) => !t.retired);

/** Default "who sees it": personal templates are private, everything else shared. */
export function templateIsShared(t: SectionTemplate): boolean {
  return t.shared ?? true;
}

/** Turns a template into concrete rows for a given day/locale. */
export function instantiateTemplate(t: SectionTemplate, locale: Locale, today: string) {
  const schema: PropertyDef[] = (t.props ?? []).map((p) => ({
    id: newPropertyId(),
    name: p.name[locale],
    type: p.type,
    ...(p.options ? { options: p.options.map((o) => o[locale]) } : {}),
  }));
  const idByKey = new Map((t.props ?? []).map((p, i) => [p.key, schema[i]]));

  const items = (t.items ?? []).map((it, position) => {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(it.props ?? {})) {
      const def = idByKey.get(key);
      const tp = t.props?.find((p) => p.key === key);
      if (!def || !tp) continue;
      props[def.id] =
        tp.type === "select" && typeof value === "number"
          ? tp.options?.[value]?.[locale]
          : tp.type === "date" && typeof value === "string" && value.startsWith("+")
            ? addDays(today, Number(value.slice(1)))
            : value;
    }
    let habit: Habit | null = null;
    if (it.every && it.time) {
      const r = it.every;
      habit = {
        time: it.time,
        nudge: it.nudge ?? false,
        outdoor: it.outdoor ?? false,
        repeat:
          r.kind === "interval"
            ? { kind: "interval", every: r.every, start: r.every >= 14 ? addDays(today, 7) : today }
            : r.kind === "weekly"
              ? { kind: "weekly", days: r.days.length ? r.days : ALL_WEEK }
              : { kind: "monthly", day: r.day, every: r.every ?? 1, start: `${today.slice(0, 8)}01` },
      };
      props._habit = habit;
    }
    if (it.wheel) props._wheel = { options: it.wheel.map((o) => ({ label: o.label[locale], ...(o.tag ? { tag: o.tag[locale] } : {}) })) };
    return { title: it.title[locale], done: !!it.done, position, props, habit };
  });
  return { schema, items };
}
