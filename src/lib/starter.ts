import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n";
import type { AutomationDef } from "@/lib/engine/types";
import type { PropertyDef } from "@/lib/registry/properties";
import { nextRunAt } from "@/lib/engine/schedule";
import { nextReminder, todayKey } from "@/lib/engine/habits";
import { instantiateTemplate, SECTION_TEMPLATES } from "@/lib/registry/templates";

/** Who a new home is for, from the three onboarding questions. */
export const HOUSEHOLD_KINDS = ["solo", "couple", "family", "roommates"] as const;
export type HouseholdKind = (typeof HOUSEHOLD_KINDS)[number];
export interface HomeShape {
  who: HouseholdKind;
  dog: boolean;
  kids: boolean;
}

/** Shared spaces the home creator starts with (keys in the template library), from what they told us. */
export function starterSpaces(shape: HomeShape): string[] {
  return [
    "groceries",
    "cleaning",
    ...(shape.who === "couple" ? ["important-dates"] : []),
    ...(shape.who === "roommates" ? ["subscriptions"] : []),
    ...(shape.dog ? ["dog-care"] : []),
    ...(shape.kids ? ["kids"] : []),
  ];
}

const copy = {
  en: {
    routine: "Morning routine",
    routineItems: ["Stretch 5 minutes 🧘", "Glass of water 💧", "Make the bed 🛏️"],
    stretch: "Stretch",
    stretchTitle: "Stretch time 🧘",
    stretchBody: "5 minutes. Your back will thank you.",
    stretched: "Stretched ✔",
    openRoutine: "Open morning routine",
  },
  he: {
    routine: "שגרת בוקר",
    routineItems: ["מתיחות 5 דקות 🧘", "כוס מים 💧", "לסדר את המיטה 🛏️"],
    stretch: "מתיחות",
    stretchTitle: "זמן מתיחות 🧘",
    stretchBody: "5 דקות. הגב יודה לך.",
    stretched: "התמתחתי ✔",
    openRoutine: "לשגרת הבוקר",
  },
};

/**
 * Creates the starter spaces and automations for a newly set-up user: a private
 * morning routine for everyone, and for whoever creates the home (`home` given)
 * the shared house lists that fit it. Nothing personal is written for anyone.
 */
export async function seedStarterBrain(db: SupabaseClient, opts: { userId: string; householdId: string; locale: Locale; timezone: string; home?: HomeShape }) {
  const c = copy[opts.locale];
  const today = todayKey(opts.timezone);
  // Shared house spaces come from the template library so they match "New space".
  const shared = opts.home ? starterSpaces(opts.home).map((key) => SECTION_TEMPLATES.find((t) => t.key === key)!).map((t) => ({ t, ...instantiateTemplate(t, opts.locale, today) })) : [];
  const sectionRows = [
    { slug: `routine-${opts.userId.slice(0, 8)}`, title: c.routine, icon: "☀️", color: "amber", view: "checklist", owner_id: opts.userId, schema: [] as PropertyDef[] },
    ...shared.map(({ t, schema }) => ({ slug: t.key, template: t.key, title: t.title[opts.locale], icon: t.icon, color: t.color, view: t.view, owner_id: null, schema })),
  ].map((s, i) => ({ ...s, household_id: opts.householdId, position: i }));

  const { data: sections, error } = await db.from("sections").insert(sectionRows).select("id,slug");
  if (error) throw error;
  const id = (prefix: string) => sections!.find((s) => s.slug?.startsWith(prefix))!.id;
  const routine = id("routine");

  const items = [
    ...c.routineItems.map((title, i) => ({ section_id: routine, title, position: i })),
    ...shared.flatMap(({ t, items }) =>
      items.map(({ habit, ...it }) => ({
        ...it,
        section_id: id(t.key),
        remind_at: habit ? (nextReminder(habit, new Date(), opts.timezone, () => false)?.at.toISOString() ?? null) : null,
      })),
    ),
  ];
  await db.from("items").insert(items);

  const defs: AutomationDef[] = [
    {
      name: c.stretch,
      icon: "🧘",
      enabled: true,
      trigger: { type: "event", event: "wake", delayMinutes: 5 },
      conditions: [{ type: "once_per_day" }],
      actions: [
        { type: "push", title: c.stretchTitle, body: c.stretchBody },
        { type: "open_section", sectionId: routine, label: c.openRoutine },
        { type: "checkoff", label: c.stretched },
      ],
    },
  ];
  const now = new Date();
  await db.from("automations").insert(
    defs.map((d) => ({
      ...d,
      household_id: opts.householdId,
      owner_id: opts.userId,
      target_user_id: opts.userId,
      next_run_at: nextRunAt(d.trigger, now, opts.timezone)?.toISOString() ?? null,
    })),
  );
}
