// Property types a section can define (the Notion-style "database" columns).
// Adding a new type = one entry here + a case in components/sections/PropertyInput.
import { zonedTimeToUtc } from "@/lib/engine/time";

export const PROPERTY_TYPES = {
  text: { label: "Text", icon: "Aa" },
  number: { label: "Number", icon: "#" },
  price: { label: "Price", icon: "₪" },
  date: { label: "Date", icon: "📅" },
  checkbox: { label: "Checkbox", icon: "☑️" },
  select: { label: "Select", icon: "🏷️" },
  url: { label: "Link", icon: "🔗" },
  person: { label: "Person", icon: "👤" },
  rating: { label: "Rating", icon: "❤️" },
} as const;

export type PropertyType = keyof typeof PROPERTY_TYPES;

export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  /** Choices for `select`. */
  options?: string[];
}

export function newPropertyId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function formatPropertyValue(def: PropertyDef, value: unknown, locale: string): string {
  if (value === null || value === undefined || value === "") return "";
  switch (def.type) {
    case "price":
      return new Intl.NumberFormat(locale, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(Number(value));
    case "date":
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(String(value)));
    case "checkbox":
      return value ? "✓" : "";
    case "rating":
      return "❤️".repeat(Math.max(0, Math.min(5, Number(value))));
    default:
      return String(value);
  }
}

/**
 * The first date property doubles as the item's due date (Today screen + calendar feed):
 * its time when it has one ("2026-11-03T10:30" from quick-add), else 09:00, in `timeZone`.
 */
export function dueFromProps(schema: PropertyDef[], props: Record<string, unknown>, timeZone: string): string | null {
  const dateProp = schema.find((p) => p.type === "date");
  const v = dateProp ? props[dateProp.id] : null;
  if (typeof v !== "string" || !v) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  const [hh, mm] = (/T(\d{2}:\d{2})/.exec(v)?.[1] ?? "09:00").split(":").map(Number);
  return zonedTimeToUtc(y, m, d, hh, mm, timeZone).toISOString();
}
