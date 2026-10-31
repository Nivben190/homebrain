// "Make a space like this" and template links: a space's structure without its data.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item, Section } from "@/lib/db-types";
import { HABIT_PROP, nextReminder, readHabit } from "@/lib/engine/habits";

/** What travels: the layout, properties and item titles, with routine schedules and wheel options. */
export interface SpaceShape {
  title: string;
  icon: string;
  color: string;
  view: Section["view"];
  template: string | null;
  schema: Section["schema"];
  items: { title: string; props: Record<string, unknown> }[];
}

/** Item props that are structure, not data. Everything else (values, photos, notes, logs, dates) stays home. */
const STRUCTURAL = [HABIT_PROP, "_wheel"];

/** A routine's schedule without who does it: those are people of the home it came from. */
function structural(key: string, value: unknown) {
  if (key !== HABIT_PROP || !value || typeof value !== "object") return value;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { assign, ...schedule } = value as Record<string, unknown>;
  return schedule;
}

export function shapeOf(section: Pick<Section, "title" | "icon" | "color" | "view" | "template" | "schema">, items: Pick<Item, "title" | "props" | "position">[]): SpaceShape {
  return {
    title: section.title,
    icon: section.icon,
    color: section.color,
    view: section.view,
    template: section.template ?? null,
    schema: section.schema,
    items: [...items]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ title: i.title, props: Object.fromEntries(STRUCTURAL.filter((k) => i.props?.[k] !== undefined).map((k) => [k, structural(k, i.props[k])])) })),
  };
}

/** Creates a space shaped like `shape` (section, then items); a failed item insert removes the half-made space. */
export async function createFromShape(
  db: SupabaseClient,
  shape: SpaceShape,
  opts: { householdId: string; ownerId: string | null; title: string; timeZone: string },
): Promise<{ id: string } | { error: string }> {
  const rows = rowsFromShape(shape, opts);
  const { data, error } = await db.from("sections").insert(rows.section).select("id").single();
  if (error || !data) return { error: error?.message ?? "permission denied" };
  const list = rows.items(data.id);
  if (list.length) {
    const { error: itemsError } = await db.from("items").insert(list);
    if (itemsError) {
      await db.from("sections").delete().eq("id", data.id);
      return { error: itemsError.message };
    }
  }
  return { id: data.id as string };
}

/** Reads a template link's shape (service role, after checking the token's form). */
export async function readSharedTemplate(admin: SupabaseClient, token: string): Promise<SpaceShape | null> {
  if (!/^[0-9a-f]{24}$/.test(token)) return null;
  const { data } = await admin.from("space_templates").select("shape").eq("token", token).maybeSingle<{ shape: SpaceShape }>();
  return data?.shape ?? null;
}

/** Rows to insert for a new space shaped like `shape`; routines get their next reminder from now. */
export function rowsFromShape(shape: SpaceShape, opts: { householdId: string; ownerId: string | null; title: string; timeZone: string; now?: Date }) {
  const now = opts.now ?? new Date();
  return {
    section: {
      household_id: opts.householdId,
      owner_id: opts.ownerId,
      title: opts.title,
      icon: shape.icon,
      color: shape.color,
      view: shape.view,
      template: shape.template,
      schema: shape.schema,
      position: now.getTime() / 1000,
    },
    items: (sectionId: string) =>
      shape.items.map((it, position) => {
        const habit = readHabit(it.props);
        return {
          section_id: sectionId,
          title: it.title,
          position,
          props: it.props,
          remind_at: habit ? (nextReminder(habit, now, opts.timeZone, () => false)?.at.toISOString() ?? null) : null,
        };
      }),
  };
}
