// Brain recipes (roadmap 2.7): ready-made routines added with one tap.
import type { AutomationDef } from "@/lib/engine/types";
import type { Locale } from "@/i18n";

export type RecipeId = "date_night" | "supermarket" | "bills" | "love_note";

export interface RecipeSpace {
  id: string;
  view: string;
  template: string | null;
}

export interface Recipe {
  id: RecipeId;
  icon: string;
  /** One automation per person when true ("tell you both"). */
  forBoth: boolean;
  /** Null when this home lacks what the recipe needs. */
  build(ctx: { locale: Locale; spaces: RecipeSpace[]; hasPartner: boolean }): AutomationDef | null;
}

const L = (locale: Locale, en: string, he: string) => (locale === "he" ? he : en);

export const RECIPES: Recipe[] = [
  {
    id: "date_night",
    icon: "🎡",
    forBoth: true,
    build: ({ locale, spaces }) => {
      const wheel = spaces.find((s) => s.view === "wheel");
      return {
        name: L(locale, "Date night", "ערב דייט"),
        icon: "🎡",
        enabled: true,
        trigger: { type: "schedule", days: [4], times: ["20:00"] },
        conditions: [],
        actions: [
          { type: "push", title: L(locale, "Date night 💞", "ערב דייט 💞"), body: L(locale, "Spin the wheel and pick tonight's plan.", "סובבו את הגלגל ובחרו מה עושים הערב.") },
          ...(wheel ? [{ type: "open_section" as const, sectionId: wheel.id, label: L(locale, "Spin", "לסובב") }] : []),
        ],
      };
    },
  },
  {
    id: "supermarket",
    icon: "🛒",
    forBoth: false,
    build: ({ locale, spaces }) => {
      const list = spaces.find((s) => s.template === "groceries") ?? spaces.find((s) => s.view === "list" || s.view === "checklist");
      if (!list) return null;
      return {
        name: L(locale, "Supermarket list", "רשימת סופר"),
        icon: "🛒",
        enabled: true,
        trigger: { type: "event", event: "arrive_store", delayMinutes: 0 },
        conditions: [{ type: "once_per_day" }],
        actions: [
          { type: "push", title: L(locale, "At the store?", "בסופר?"), body: L(locale, "Here's the list.", "הנה הרשימה.") },
          { type: "open_section", sectionId: list.id, label: L(locale, "Open list", "לרשימה") },
        ],
      };
    },
  },
  {
    id: "bills",
    icon: "💳",
    forBoth: false,
    build: ({ locale, spaces }) => {
      const subs = spaces.find((s) => s.view === "subscriptions");
      return {
        name: L(locale, "Bill check", "בדיקת חשבונות"),
        icon: "💳",
        enabled: true,
        trigger: { type: "schedule", days: [0], times: ["09:00"] },
        conditions: [],
        actions: [
          { type: "push", title: L(locale, "Bills this week", "חשבונות השבוע"), body: L(locale, "A minute to check what renews and what's due.", "דקה לבדוק מה מתחדש ומה לשלם.") },
          ...(subs ? [{ type: "open_section" as const, sectionId: subs.id, label: L(locale, "Subscriptions", "מנויים") }] : []),
          { type: "checkoff", label: L(locale, "Checked", "נבדק") },
        ],
      };
    },
  },
  {
    id: "love_note",
    icon: "💌",
    forBoth: false,
    build: ({ locale, hasPartner }) =>
      hasPartner
        ? {
            name: L(locale, "Morning love note", "הודעת אהבה בבוקר"),
            icon: "💌",
            enabled: true,
            trigger: { type: "event", event: "wake", delayMinutes: 0 },
            conditions: [{ type: "once_per_day" }],
            actions: [{ type: "whatsapp", to: "partner", text: L(locale, "Good morning ❤️", "בוקר טוב ❤️"), label: L(locale, "Send love", "לשלוח אהבה") }],
          }
        : null,
  },
];
