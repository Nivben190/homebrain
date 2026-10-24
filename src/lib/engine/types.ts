import { z } from "zod";

// ---------------------------------------------------------------------------
// Triggers: when an automation fires
// ---------------------------------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
const weekday = z.number().int().min(0).max(6); // 0 = Sunday

export const EVENT_TYPES = ["wake", "arrive_home", "leave_home", "bedtime", "custom"] as const;

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("schedule"),
    days: z.array(weekday).min(1),
    times: z.array(hhmm).min(1),
  }),
  z.object({
    type: z.literal("event"),
    event: z.enum(EVENT_TYPES),
    delayMinutes: z.number().int().min(0).max(24 * 60).default(0),
  }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

// ---------------------------------------------------------------------------
// Conditions: optional guards checked at fire time
// ---------------------------------------------------------------------------

export const conditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("time_window"), from: hhmm, to: hhmm }),
  z.object({ type: z.literal("days"), days: z.array(weekday).min(1) }),
  z.object({ type: z.literal("once_per_day") }),
]);
export type Condition = z.infer<typeof conditionSchema>;

// ---------------------------------------------------------------------------
// Actions: what the brain does. Strings support {{templates}}.
// ---------------------------------------------------------------------------

/** "me", "partner", or a literal phone/email. */
const recipient = z.string().min(1);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("push"), title: z.string().min(1), body: z.string().default("") }),
  z.object({ type: z.literal("whatsapp"), to: recipient, text: z.string().min(1), label: z.string().optional() }),
  z.object({ type: z.literal("sms"), to: recipient, text: z.string().min(1), label: z.string().optional() }),
  z.object({ type: z.literal("email"), to: recipient, subject: z.string().min(1), body: z.string().default("") }),
  z.object({ type: z.literal("alarm"), time: hhmm, label: z.string().optional() }),
  z.object({ type: z.literal("open_section"), sectionId: z.string().uuid(), label: z.string().optional() }),
  z.object({ type: z.literal("create_item"), sectionId: z.string().uuid(), title: z.string().min(1) }),
  z.object({
    type: z.literal("calendar"),
    title: z.string().min(1),
    startInMinutes: z.number().int().min(0).default(0),
    durationMinutes: z.number().int().min(5).default(30),
  }),
  z.object({ type: z.literal("checkoff"), label: z.string().default("Done") }),
]);
export type Action = z.infer<typeof actionSchema>;

export const automationDefSchema = z.object({
  name: z.string().min(1),
  icon: z.string().default("⚡"),
  enabled: z.boolean().default(true),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1),
});
export type AutomationDef = z.infer<typeof automationDefSchema>;

// ---------------------------------------------------------------------------
// Rendered output stored on a run and shown on /run/<id>
// ---------------------------------------------------------------------------

export type RenderedAction =
  | { kind: "link"; icon: string; label: string; href: string; external?: boolean }
  /** `day`: for reminder-calendar alerts, the date that "No more needed" handles. */
  | { kind: "done"; label: string; day?: string }
  | { kind: "note"; icon: string; text: string };
