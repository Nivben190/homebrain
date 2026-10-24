// UI metadata for triggers, conditions and actions. The engine's zod schemas in
// lib/engine/types.ts are the source of truth; this file only adds icons,
// defaults and human-readable summaries.
import type { Dict } from "@/i18n";
import type { Action, Condition, Trigger } from "@/lib/engine/types";

export const ACTION_META: Record<Action["type"], { icon: string; make: () => Action }> = {
  push: { icon: "🔔", make: () => ({ type: "push", title: "", body: "" }) },
  whatsapp: { icon: "💚", make: () => ({ type: "whatsapp", to: "partner", text: "" }) },
  sms: { icon: "💬", make: () => ({ type: "sms", to: "partner", text: "" }) },
  email: { icon: "📧", make: () => ({ type: "email", to: "me", subject: "", body: "" }) },
  alarm: { icon: "⏰", make: () => ({ type: "alarm", time: "07:00" }) },
  calendar: { icon: "📅", make: () => ({ type: "calendar", title: "", startInMinutes: 60, durationMinutes: 30 }) },
  open_section: { icon: "📂", make: () => ({ type: "open_section", sectionId: "" }) },
  create_item: { icon: "➕", make: () => ({ type: "create_item", sectionId: "", title: "" }) },
  checkoff: { icon: "✅", make: () => ({ type: "checkoff", label: "Done" }) },
};

export const CONDITION_META: Record<Condition["type"], { icon: string; make: () => Condition }> = {
  once_per_day: { icon: "1️⃣", make: () => ({ type: "once_per_day" }) },
  time_window: { icon: "🕐", make: () => ({ type: "time_window", from: "05:00", to: "11:00" }) },
  days: { icon: "📆", make: () => ({ type: "days", days: [0, 1, 2, 3, 4] }) },
};

export const EVENT_ICONS: Record<string, string> = { wake: "☀️", arrive_home: "🏠", leave_home: "🚪", bedtime: "🌙", custom: "✨" };

export function describeDays(days: number[], t: Dict): string {
  const sorted = [...days].sort();
  if (sorted.length === 7) return "✱";
  return sorted.map((d) => t.weekdaysShort[d]).join(" ");
}

export function describeTrigger(trigger: Trigger, t: Dict): string {
  if (trigger.type === "schedule") return `🗓️ ${describeDays(trigger.days, t)} · ${[...trigger.times].sort().join(", ")}`;
  const base = `${EVENT_ICONS[trigger.event] ?? "✨"} ${t.events[trigger.event]}`;
  return trigger.delayMinutes ? `${base} · +${trigger.delayMinutes} ${t.common.minutes}` : base;
}
