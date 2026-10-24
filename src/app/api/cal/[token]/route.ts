import { createSupabaseAdmin } from "@/lib/supabase/server";
import { buildIcs, type IcsEvent } from "@/lib/ics";
import { addDays, dueDaysBetween, readHabit, todayKey } from "@/lib/engine/habits";
import { zonedTimeToUtc } from "@/lib/engine/time";

export const dynamic = "force-dynamic";

/**
 * Private calendar feed: every open item with a due date in the spaces this
 * user can see. Subscribe via webcal://<host>/api/cal/<ics_token>.ics
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  const db = createSupabaseAdmin();
  const { data: profile } = await db.from("profiles").select("user_id,household_id,timezone").eq("ics_token", token).maybeSingle();
  if (!profile?.household_id) return new Response("Not found", { status: 404 });

  const { data: sections } = await db
    .from("sections")
    .select("id,title,icon,view")
    .eq("household_id", profile.household_id)
    .or(`owner_id.is.null,owner_id.eq.${profile.user_id}`);
  const byId = new Map((sections ?? []).map((s) => [s.id, s]));
  const { data: items } = await db
    .from("items")
    .select("id,title,section_id,due_at")
    .in("section_id", [...byId.keys()])
    .not("due_at", "is", null)
    .eq("done", false)
    .gte("due_at", new Date(Date.now() - 30 * 86400000).toISOString());

  const origin = new URL(request.url).origin;
  const events: IcsEvent[] = (items ?? []).map((i) => {
    const s = byId.get(i.section_id)!;
    const start = new Date(i.due_at!);
    return {
      uid: `${i.id}@homebrain`,
      title: `${s.icon} ${i.title}`,
      start,
      end: new Date(start.getTime() + 86400000),
      allDay: true,
      timeZone: profile.timezone,
      description: s.title,
      url: `${origin}/sections/${s.id}`,
    };
  });
  // Tracker sessions for the next 60 days, at their reminder time.
  const trackerIds = (sections ?? []).filter((s) => s.view === "tracker").map((s) => s.id);
  if (trackerIds.length) {
    const { data: tracked } = await db.from("items").select("id,title,section_id,props").in("section_id", trackerIds).eq("done", false);
    const today = todayKey(profile.timezone);
    for (const i of tracked ?? []) {
      const habit = readHabit(i.props ?? {});
      if (!habit) continue;
      const s = byId.get(i.section_id)!;
      const [h, m] = habit.time.split(":").map(Number);
      for (const day of dueDaysBetween(habit, today, addDays(today, 60))) {
        const start = zonedTimeToUtc(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), h, m, profile.timezone);
        events.push({ uid: `${i.id}-${day}@homebrain`, title: `${s.icon} ${i.title}`, start, end: new Date(start.getTime() + 30 * 60000), description: s.title, url: `${origin}/sections/${s.id}` });
      }
    }
  }

  return new Response(buildIcs("Home Brain", events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
}
