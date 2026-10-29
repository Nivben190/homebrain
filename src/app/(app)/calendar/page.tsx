import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { addDays, readHabit, todayKey } from "@/lib/engine/habits";
import { localDateKey, zonedParts } from "@/lib/engine/time";
import { getJewishCalendar } from "@/lib/jewish";
import { DEFAULT_PLACE } from "@/lib/weather";
import { calendarAccess, listEvents } from "@/lib/gcal";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { buildAgenda } from "@/lib/agenda";
import type { Automation, Item, Section } from "@/lib/db-types";
import { PageHeader } from "@/components/ui";
import { CalendarAddButton } from "@/components/CalendarAddButton";

const PERSON_COLORS = ["#7457ff", "#ff6fa8", "#22c38e", "#ffab2e", "#2f8cff", "#ff6a55"];

/** Family calendar (roadmap 3.4): a week of everything dated, colored by person. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { supabase, user, profile, members } = await requireHome();
  const t = await getT();
  const tz = profile.timezone;
  const week = Math.max(-52, Math.min(52, Number((await searchParams).w ?? 0) || 0));
  const today = todayKey(tz);
  const from = addDays(today, week * 7);
  const to = addDays(from, 7);
  // A day of margin each side; buildAgenda drops what falls outside the week in local time.
  const start = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000);
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000);
  const local = (iso: string) => {
    const d = new Date(iso);
    const p = zonedParts(d, tz);
    return { day: localDateKey(d, tz), time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` };
  };

  const access = await calendarAccess(createSupabaseAdmin(), user.id);
  const [{ data: items }, { data: trackers }, { data: automations }, { data: sections }, holidays, google] = await Promise.all([
    supabase.from("items").select("id,title,section_id,due_at,assignee_id,created_by").eq("done", false).gte("due_at", start.toISOString()).lt("due_at", end.toISOString()).returns<Item[]>(),
    supabase.from("items").select("id,title,section_id,props,assignee_id,created_by,sections!inner(view)").eq("sections.view", "tracker").eq("done", false).returns<Item[]>(),
    supabase.from("automations").select("*").eq("enabled", true).not("next_run_at", "is", null).returns<Automation[]>(),
    supabase.from("sections").select("id,icon,owner_id").returns<Pick<Section, "id" | "icon" | "owner_id">[]>(),
    getJewishCalendar(profile.lat ?? DEFAULT_PLACE.lat, profile.lon ?? DEFAULT_PLACE.lon, tz, from, to).catch(() => []),
    access ? listEvents(access, start, end).catch(() => []) : Promise.resolve([]),
  ]);
  const icon = new Map((sections ?? []).map((s) => [s.id, s.icon]));
  const owner = new Map((sections ?? []).map((s) => [s.id, s.owner_id]));

  const agenda = buildAgenda(from, 7, {
    members: members.map((m) => m.user_id),
    items: (items ?? []).map((i) => ({ id: i.id, title: i.title, icon: icon.get(i.section_id) ?? "📌", sectionId: i.section_id, ...local(i.due_at!), who: i.assignee_id })),
    sessions: (trackers ?? []).flatMap((i) => {
      const habit = readHabit(i.props);
      return habit ? [{ id: i.id, title: i.title, icon: icon.get(i.section_id) ?? "🔁", sectionId: i.section_id, habit, fallback: i.assignee_id ?? owner.get(i.section_id) ?? i.created_by }] : [];
    }),
    automations: (automations ?? []).map((a) => ({ id: a.id, name: a.name, icon: a.icon, ...local(a.next_run_at!), who: a.target_user_id })),
    holidays: holidays
      .filter((h) => h.category === "holiday" || h.category === "roshchodesh")
      .map((h) => ({ day: h.date.slice(0, 10), title: profile.locale === "he" && h.hebrew ? h.hebrew : h.title })),
    google: google.map((g) => (g.dateTime ? { ...local(g.dateTime), title: g.title, who: user.id } : { day: g.date!, time: null, title: g.title, who: user.id })),
  });

  const color = new Map(members.map((m, n) => [m.user_id, PERSON_COLORS[n % PERSON_COLORS.length]]));
  const dayFmt = new Intl.DateTimeFormat(profile.locale, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
  const nav = "flex size-10 items-center justify-center rounded-full bg-sunken";

  return (
    <>
      <PageHeader
        title={t.calendar.title}
        action={
          <div className="flex items-center gap-2">
            <Link href={`/calendar?w=${week - 1}`} aria-label={t.calendar.prev} className={nav}>
              <ChevronLeft className="size-5 rtl:rotate-180" />
            </Link>
            {week !== 0 && (
              <Link href="/calendar" className="rounded-full bg-sunken px-3 py-2 text-sm font-semibold">
                {t.calendar.thisWeek}
              </Link>
            )}
            <Link href={`/calendar?w=${week + 1}`} aria-label={t.calendar.next} className={nav}>
              <ChevronRight className="size-5 rtl:rotate-180" />
            </Link>
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap gap-3 px-1 text-xs text-muted">
        {members.map((m) => (
          <span key={m.user_id} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: color.get(m.user_id) }} />
            {m.emoji} {m.display_name}
          </span>
        ))}
        {!access && (
          <Link href="/me" className="font-semibold text-accent">
            📅 {t.calendar.connectGoogle}
          </Link>
        )}
      </div>
      <div className="space-y-3">
        {[...agenda.entries()].map(([day, entries]) => (
          <section key={day} aria-label={dayFmt.format(new Date(`${day}T12:00:00Z`))} className={day === today ? "glass rounded-3xl p-4 ring-2 ring-accent" : "glass rounded-3xl p-4"}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-bold">{dayFmt.format(new Date(`${day}T12:00:00Z`))}</h2>
              <CalendarAddButton day={day} />
            </div>
            {entries.length === 0 ? (
              <p className="text-sm text-muted">{t.calendar.free}</p>
            ) : (
              <ul className="space-y-1.5">
                {entries.map((e, n) => {
                  const row = (
                    <>
                      <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-muted">{e.time ?? t.calendar.allDay}</span>
                      <span className="flex shrink-0 gap-0.5" aria-hidden>
                        {(e.who.length ? e.who : [""]).map((w, k) => (
                          <span key={k} className="size-2 rounded-full" style={{ background: color.get(w) ?? "var(--faint-deco)" }} />
                        ))}
                      </span>
                      <span aria-hidden>{e.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    </>
                  );
                  return (
                    <li key={n}>
                      {e.href ? (
                        <Link href={e.href} className="flex items-center gap-2 py-0.5">
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 py-0.5">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
