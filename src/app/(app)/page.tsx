import Link from "next/link";
import { requireHome, getT } from "@/lib/session";
import { zonedParts } from "@/lib/engine/time";
import { Card, IconTile, SectionTitle } from "@/components/ui";
import { RunCard } from "@/components/today/RunCard";
import { AwakeButton } from "@/components/today/AwakeButton";
import { PushPrompt } from "@/components/today/PushPrompt";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import type { Automation, CheckinRow, Item, Pet, RequestRow, Run, Section } from "@/lib/db-types";
import { QuickActions } from "@/components/today/QuickActions";
import { RequestCards } from "@/components/today/Requests";
import { DayCard } from "@/components/today/DayCard";
import { DEFAULT_PLACE, getForecast, outdoorWarning, walkAdvice, weatherAt } from "@/lib/weather";
import { getJewishCalendar, holyStatus } from "@/lib/jewish";
import { foodDaysLeft } from "@/lib/engine/food";
import { TodayPractice } from "@/components/today/TodayPractice";
import { OnThisDay, type Memory } from "@/components/today/OnThisDay";
import type { Photo } from "@/lib/photos";

/** First image attached to an item (server-side; mirrors lib/photos readPhotos). */
function readPhotosServer(props: Record<string, unknown>): Photo | null {
  const list = Array.isArray(props._photos) ? (props._photos as Photo[]) : [];
  return list.find((p) => p?.kind === "image") ?? null;
}
import { addDays, assigneesFor, isDue, readHabit, todayKey } from "@/lib/engine/habits";

function greetingKey(hour: number) {
  if (hour >= 5 && hour < 12) return "morning" as const;
  if (hour >= 12 && hour < 17) return "afternoon" as const;
  if (hour >= 17 && hour < 22) return "evening" as const;
  return "night" as const;
}

/** Consecutive completed runs, newest first; a still-open run from today doesn't break it. */
function streak(runs: Run[]) {
  let n = 0;
  for (const [i, r] of runs.entries()) {
    if (r.done_at) n++;
    else if (i === 0 && Date.now() - new Date(r.fired_at).getTime() < 86400000) continue;
    else break;
  }
  return n;
}

export default async function TodayPage() {
  const { supabase, user, profile, partner, members } = await requireHome();
  const t = await getT();
  const now = new Date();
  const local = zonedParts(now, profile.timezone);
  const dayAgo = new Date(now.getTime() - 86400000).toISOString();
  const weekAhead = new Date(now.getTime() + 7 * 86400000).toISOString();

  const today = todayKey(profile.timezone, now);
  const lat = profile.lat ?? DEFAULT_PLACE.lat;
  const lon = profile.lon ?? DEFAULT_PLACE.lon;
  const [pendingQ, historyQ, automationsQ, sectionsQ, dueQ, wakeQ, trackerQ, memoriesQ, requestsQ, petsQ, forecast, holyItems] = await Promise.all([
    supabase.from("runs").select("*").eq("user_id", user.id).is("acknowledged_at", null).gte("fired_at", dayAgo).order("fired_at", { ascending: false }).returns<Run[]>(),
    supabase.from("runs").select("*").eq("user_id", user.id).gte("fired_at", new Date(now.getTime() - 60 * 86400000).toISOString()).order("fired_at", { ascending: false }).returns<Run[]>(),
    supabase.from("automations").select("*").eq("target_user_id", user.id).eq("enabled", true).returns<Automation[]>(),
    supabase.from("sections").select("*").order("position").returns<Section[]>(),
    supabase.from("items").select("*").eq("done", false).not("due_at", "is", null).gte("due_at", new Date(now.getTime() - 2 * 86400000).toISOString()).lte("due_at", weekAhead).order("due_at").limit(6).returns<Item[]>(),
    supabase.from("events").select("id").eq("user_id", user.id).eq("type", "wake").gte("created_at", new Date(now.getTime() - 16 * 3600000).toISOString()).limit(1),
    // Tracker items + their check-in history, in the same round trip.
    supabase
      .from("items")
      .select("*, checkins(*), sections!inner(view)")
      .eq("sections.view", "tracker")
      .eq("done", false)
      .gte("checkins.day", addDays(today, -400))
      .returns<(Item & { checkins: CheckinRow[] })[]>(),
    // Memory-space items, for "On this day".
    supabase.from("items").select("id,title,props,section_id, sections!inner(view,schema,icon,color)").eq("sections.view", "gallery").returns<(Pick<Item, "id" | "title" | "props" | "section_id"> & { sections: Pick<Section, "schema" | "icon" | "color"> })[]>(),
    supabase.from("requests").select("*").in("status", ["open", "doing"]).order("created_at").returns<RequestRow[]>(),
    supabase.from("pets").select("*").order("created_at").limit(1).returns<Pet[]>(),
    getForecast(lat, lon, profile.timezone),
    getJewishCalendar(lat, lon, profile.timezone, addDays(today, -2), addDays(today, 14)),
  ]);
  const memberList = members.map((m) => ({ id: m.user_id, name: m.display_name, emoji: m.emoji }));
  const partnerMember = memberList.find((m) => m.id !== user.id) ?? null;
  const pet = petsQ.data?.[0] ?? null;
  const requests = requestsQ.data ?? [];
  const pending = pendingQ.data ?? [];
  const sectionById0 = new Map((sectionsQ.data ?? []).map((s) => [s.id, s]));
  const memories: Memory[] = (memoriesQ.data ?? []).flatMap((i) => {
    const dateProp = i.sections.schema.find((p) => p.type === "date");
    const date = dateProp ? String(i.props[dateProp.id] ?? "") : "";
    const years = Number(today.slice(0, 4)) - Number(date.slice(0, 4));
    if (!date || date.slice(5, 10) !== today.slice(5, 10) || years < 1) return [];
    return [{ id: i.id, sectionId: i.section_id, title: i.title, years, icon: i.sections.icon, color: i.sections.color, cover: readPhotosServer(i.props) }];
  });
  // Who's on each session today + weather for outdoor ones; mine first.
  const hours = forecast?.hours ?? [];
  const practice = (trackerQ.data ?? [])
    .flatMap((i) => {
      const habit = readHabit(i.props);
      if (!habit || !isDue(habit, today)) return [];
      const section = sectionById0.get(i.section_id);
      const ids = assigneesFor(habit, today, members.map((m) => m.user_id), i.assignee_id ?? section?.owner_id ?? i.created_by);
      const warning = habit.outdoor ? outdoorWarning(weatherAt(hours, today, habit.time), { rain: t.daily.rainAt, hot: t.daily.hotAt }) : null;
      return [{ item: i, habit, ids, warning, mine: ids.includes(user.id) }];
    })
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.habit.time.localeCompare(b.habit.time));
  const automations = automationsQ.data ?? [];
  const sections = sectionsQ.data ?? [];
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const awakeToday = (wakeQ.data?.length ?? 0) > 0;

  const streaks = automations
    .filter((a) => a.actions.some((x) => x.type === "checkoff"))
    .map((a) => ({ a, n: streak((historyQ.data ?? []).filter((r) => r.automation_id === a.id)) }))
    .filter((s) => s.n > 0);

  const upcoming = automations
    .filter((a) => a.next_run_at)
    .sort((a, b) => a.next_run_at!.localeCompare(b.next_run_at!))
    .slice(0, 3);
  const timeFmt = new Intl.DateTimeFormat(profile.locale, { timeZone: profile.timezone, weekday: "short", hour: "2-digit", minute: "2-digit" });
  const dateFmt = new Intl.DateTimeFormat(profile.locale, { timeZone: profile.timezone, weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <RealtimeRefresh tables={["runs", "items", "requests"]} />
      <header className="safe-top mb-2 px-1 pt-2">
        <p className="text-sm font-semibold text-muted">{dateFmt.format(now)}</p>
        <h1 className="mt-1 text-[34px] font-extrabold leading-[1.1] tracking-tight">
          {t.greeting[greetingKey(local.hour)]},<br />
          <span className="bg-linear-to-r from-[#7457ff] to-[#ff6fa8] bg-clip-text text-transparent">{profile.display_name}</span> {profile.emoji}
        </h1>
        {partner && (
          <p className="mt-1 text-sm text-muted">
            🏠 {partner.emoji} {partner.display_name}
          </p>
        )}
      </header>

      <DayCard weather={forecast?.days.find((d) => d.day === today) ?? null} advice={forecast ? walkAdvice(hours, today) : null} holy={holyStatus(holyItems, now)} today={today} locale={profile.locale} place={profile.place ?? DEFAULT_PLACE.name} />

      <PushPrompt />

      {!awakeToday && local.hour >= 4 && local.hour < 13 && <AwakeButton firstOpen={profile.wake_mode === "first_open"} />}

      <QuickActions partner={partnerMember} pet={pet ? { id: pet.id, name: pet.name, emoji: pet.emoji, daysLeft: foodDaysLeft(pet, today) } : null} />

      <RequestCards incoming={requests.filter((r) => r.to_user === user.id)} outgoing={requests.filter((r) => r.from_user === user.id)} members={memberList} />

      {streaks.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
          {streaks.map(({ a, n }) => (
            <div key={a.id} className="glass flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2">
              <span className="text-lg">{a.icon}</span>
              <span className="text-sm font-bold">🔥 {n}</span>
              <span className="text-xs text-muted">{a.name}</span>
            </div>
          ))}
        </div>
      )}

      {memories.length > 0 && (
        <>
          <SectionTitle>📸 {t.memories.onThisDay}</SectionTitle>
          <OnThisDay memories={memories} />
        </>
      )}

      {practice.length > 0 && (
        <>
          <SectionTitle>{t.tracker.practiceToday}</SectionTitle>
          <TodayPractice
            items={practice.map((p) => p.item)}
            initialCheckins={practice.flatMap((p) => p.item.checkins ?? [])}
            meta={Object.fromEntries(practice.map((p) => [p.item.id, { assignees: p.ids, warning: p.warning }]))}
            members={memberList}
            userId={user.id}
            timeZone={profile.timezone}
          />
        </>
      )}

      <SectionTitle>{t.today.waiting}</SectionTitle>
      {pending.length === 0 ? (
        <Card className="py-8 text-center text-muted">{t.today.nothing}</Card>
      ) : (
        <div className="space-y-3">
          {pending.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      )}

      {(dueQ.data?.length ?? 0) > 0 && (
        <>
          <SectionTitle>{t.today.dueSoon}</SectionTitle>
          <Card className="divide-y divide-card-border p-0">
            {dueQ.data!.map((i) => {
              const s = sectionById.get(i.section_id);
              return (
                <Link key={i.id} href={`/sections/${i.section_id}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">{s?.icon}</span>
                  <span className="flex-1 truncate font-medium">{i.title}</span>
                  <span className="text-xs font-semibold text-muted">
                    {new Intl.DateTimeFormat(profile.locale, { day: "numeric", month: "short" }).format(new Date(i.due_at!))}
                  </span>
                </Link>
              );
            })}
          </Card>
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <SectionTitle>{t.today.upcoming}</SectionTitle>
          <Card className="divide-y divide-card-border p-0">
            {upcoming.map((a) => (
              <Link key={a.id} href={`/brain/${a.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg">{a.icon}</span>
                <span className="flex-1 truncate font-medium">{a.name}</span>
                <span className="text-xs font-semibold text-muted">{timeFmt.format(new Date(a.next_run_at!))}</span>
              </Link>
            ))}
          </Card>
        </>
      )}

      <SectionTitle action={<Link href="/sections" className="text-sm font-semibold text-accent">{t.nav.spaces} →</Link>}>{t.today.spaces}</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {sections.slice(0, 4).map((s) => (
          <Link key={s.id} href={`/sections/${s.id}`} className="glass flex items-center gap-3 rounded-3xl p-3 transition active:scale-[0.98]">
            <IconTile icon={s.icon} color={s.color} />
            <span className="truncate font-semibold">{s.title}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
