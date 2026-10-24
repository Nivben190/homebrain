import type { Action, RenderedAction } from "./types";
import { renderTemplate, resolveRecipient, type TemplateContext } from "./templates";

export const ALARM_SHORTCUT_NAME = "Brain Set Alarm";
export const DEFAULT_ALARM_LABEL = "Home Brain";
export const NOTES_SHORTCUT_NAME = "Brain Notes Sync";

/**
 * Runs the generic Notes sync Shortcut. Its input carries who you are and which
 * list, so the Shortcut itself is identical for everyone (shareable via iCloud).
 */
export function notesShortcutUrl(token: string, sectionId: string): string {
  const params = new URLSearchParams({ name: NOTES_SHORTCUT_NAME, input: "text", text: JSON.stringify({ token, section: sectionId }) });
  return `shortcuts://x-callback-url/run-shortcut?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * "08:00" → "8:00 AM". iOS date detection reads a bare "08:00" as the *next*
 * 8 o'clock (so 20:00 after 8 AM); an explicit AM/PM is never ambiguous.
 */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Link that runs the "Brain Set Alarm" Shortcut, then jumps to the Clock app's
 * Alarms tab. The input is two lines — "8:00 AM\nWorkout 💪" — so the Shortcut
 * reads the time from the whole text and uses the last line as the label.
 */
export function alarmShortcutUrl(time: string, label?: string): string {
  const input = `${to12h(time)}\n${label?.trim() || DEFAULT_ALARM_LABEL}`;
  const params = new URLSearchParams({ name: ALARM_SHORTCUT_NAME, input: "text", text: input, "x-success": "clock-alarm://" });
  return `shortcuts://x-callback-url/run-shortcut?${params.toString().replace(/\+/g, "%20")}`;
}

/** Side effects the executor performs server-side (no user tap needed). */
export type ServerEffect =
  /** `note` is the index in `rendered` of the card line to update with the outcome. */
  | { kind: "email"; to: string; subject: string; body: string; note: number }
  | { kind: "create_item"; sectionId: string; title: string }
  /** `links`: indexes in `rendered` of the add-to-calendar links, replaced when the event is written directly. */
  | { kind: "calendar"; title: string; start: Date; end: Date; links: number[] };

export interface RenderResult {
  title: string;
  body: string;
  rendered: RenderedAction[];
  effects: ServerEffect[];
}

/** Digits-only international number for wa.me; assumes Israel for local 0-prefixed numbers. */
export function normalizePhone(raw: string, defaultCountry = "972"): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return defaultCountry + digits.slice(1);
  return digits;
}

function toGoogleDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarLink(title: string, start: Date, end: Date): string {
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${toGoogleDate(start)}/${toGoogleDate(end)}` });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function icsLink(title: string, start: Date, end: Date): string {
  const params = new URLSearchParams({ title, start: start.toISOString(), end: end.toISOString() });
  return `/api/ics?${params}`;
}

/**
 * Turns an automation's actions into what the user sees (title, body, buttons)
 * and what the server should do on its own (emails, new items).
 */
export function renderActions(fallbackTitle: string, actions: Action[], ctx: TemplateContext): RenderResult {
  const r = (s: string) => renderTemplate(s, ctx);
  const result: RenderResult = { title: fallbackTitle, body: "", rendered: [], effects: [] };
  let titled = false;

  for (const a of actions) {
    switch (a.type) {
      case "push":
        if (!titled) {
          result.title = r(a.title);
          result.body = r(a.body);
          titled = true;
        } else {
          result.rendered.push({ kind: "note", icon: "💬", text: [r(a.title), r(a.body)].filter(Boolean).join(" — ") });
        }
        break;
      case "whatsapp": {
        const phone = resolveRecipient(a.to, "phone", ctx);
        const text = r(a.text);
        if (!phone) {
          result.rendered.push({ kind: "note", icon: "⚠️", text: `WhatsApp: no phone for "${a.to}"` });
          break;
        }
        result.rendered.push({
          kind: "link",
          icon: "💚",
          label: a.label ? r(a.label) : `WhatsApp ${a.to === "partner" ? (ctx.partner?.name ?? "") : ""}`.trim(),
          href: `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`,
          external: true,
        });
        result.rendered.push({ kind: "note", icon: "✍️", text });
        break;
      }
      case "sms": {
        const phone = resolveRecipient(a.to, "phone", ctx);
        if (!phone) {
          result.rendered.push({ kind: "note", icon: "⚠️", text: `SMS: no phone for "${a.to}"` });
          break;
        }
        result.rendered.push({
          kind: "link",
          icon: "💬",
          label: a.label ? r(a.label) : "Send SMS",
          // iOS uses "&body=" after the number.
          href: `sms:+${normalizePhone(phone)}&body=${encodeURIComponent(r(a.text))}`,
          external: true,
        });
        break;
      }
      case "email": {
        const to = resolveRecipient(a.to, "email", ctx);
        if (to) {
          result.effects.push({ kind: "email", to, subject: r(a.subject), body: r(a.body), note: result.rendered.length });
          result.rendered.push({ kind: "note", icon: "📧", text: `Sending email to ${to}` });
        }
        break;
      }
      case "alarm": {
        const name = a.label ? r(a.label) : undefined;
        result.rendered.push({
          kind: "link",
          icon: "⏰",
          label: name ? `${a.time} · ${name}` : `Set alarm ${a.time}`,
          href: alarmShortcutUrl(a.time, name),
          external: true,
        });
        break;
      }
      case "open_section":
        result.rendered.push({ kind: "link", icon: "📂", label: a.label ? r(a.label) : "Open", href: `/sections/${a.sectionId}` });
        break;
      case "create_item":
        result.effects.push({ kind: "create_item", sectionId: a.sectionId, title: r(a.title) });
        break;
      case "calendar": {
        const start = new Date(ctx.now.getTime() + a.startInMinutes * 60000);
        const end = new Date(start.getTime() + a.durationMinutes * 60000);
        const title = r(a.title);
        result.effects.push({ kind: "calendar", title, start, end, links: [result.rendered.length, result.rendered.length + 1] });
        result.rendered.push({ kind: "link", icon: "🍎", label: "Apple Calendar", href: icsLink(title, start, end) });
        result.rendered.push({ kind: "link", icon: "📅", label: "Google Calendar", href: googleCalendarLink(title, start, end), external: true });
        break;
      }
      case "checkoff":
        result.rendered.push({ kind: "done", label: r(a.label) });
        break;
    }
  }
  return result;
}
