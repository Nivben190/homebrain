import { zonedParts } from "./time";

export interface TemplatePerson {
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface TemplateContext {
  me: TemplatePerson;
  partner: TemplatePerson | null;
  now: Date;
  timeZone: string;
  locale: "en" | "he";
  /** Picks a random item title from a section; resolved before rendering. */
  pick: (sectionId: string) => string;
}

const TOKEN = /\{\{\s*([a-zA-Z_.]+)(?::([a-zA-Z0-9-]+))?\s*\}\}/g;

/** Section ids referenced by {{random:<id>}} so the caller can prefetch items. */
export function referencedSections(...templates: string[]): string[] {
  const ids = new Set<string>();
  for (const t of templates) {
    for (const m of t.matchAll(TOKEN)) if (m[1] === "random" && m[2]) ids.add(m[2]);
  }
  return [...ids];
}

/**
 * Renders {{me}} / {{user.name}}, {{partner}} / {{partner.name}}, {{date}}, {{time}}, {{weekday}} and
 * {{random:<sectionId>}}. Unknown tokens are left untouched so typos are visible.
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(TOKEN, (whole, key: string, arg?: string) => {
    switch (key) {
      case "me":
      case "user.name":
        return ctx.me.name;
      case "partner":
      case "partner.name":
        return ctx.partner?.name ?? "";
      case "random":
        return arg ? ctx.pick(arg) : whole;
      case "date":
        return new Intl.DateTimeFormat(ctx.locale, { timeZone: ctx.timeZone, dateStyle: "medium" }).format(ctx.now);
      case "time": {
        const p = zonedParts(ctx.now, ctx.timeZone);
        return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
      }
      case "weekday":
        return new Intl.DateTimeFormat(ctx.locale, { timeZone: ctx.timeZone, weekday: "long" }).format(ctx.now);
      default:
        return whole;
    }
  });
}

/** Resolves "me" / "partner" / literal to a phone number or email. */
export function resolveRecipient(to: string, field: "phone" | "email", ctx: TemplateContext): string | null {
  if (to === "me") return ctx.me[field] ?? null;
  if (to === "partner") return ctx.partner?.[field] ?? null;
  return to;
}
