import Link from "next/link";
import { Suspense } from "react";
import { requireHome, getT } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { GoogleReconnect, type ExpiredGoogle } from "@/components/today/GoogleReconnect";
import { zonedParts } from "@/lib/engine/time";
import { Card, SectionTitle, Skeleton } from "@/components/ui";
import { fill } from "@/i18n";
import { firstOn } from "@/lib/agenda";
import { RunCard } from "@/components/today/RunCard";
import { AwakeButton } from "@/components/today/AwakeButton";
import { SetupChecklist } from "@/components/today/SetupChecklist";
import { AppBadge } from "@/components/today/AppBadge";
import { ActivityStrip, type ActivityRow } from "@/components/today/ActivityStrip";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import type { Automation, CheckinRow, Item, Pet, RequestRow, Run, Section } from "@/lib/db-types";
import { QuickActions } from "@/components/today/QuickActions";
import { RequestCards } from "@/components/today/Requests";
import { DayCard } from "@/components/today/DayCard";
import { DEFAULT_PLACE, getForecast, outdoorWarning, walkAdvice, weatherAt } from "@/lib/weather";
import { getJewishCalendar, holyStatus } from "@/lib/jewish";
import { foodDaysLeft } from "@/lib/engine/food";
import { TodayPractice } from "@/components/today/TodayPractice";
import { FEW_SPACES } from "@/lib/registry/finder";
import { OnThisDay, type Memory } from "@/components/today/OnThisDay";
import { HolidayCard } from "@/components/today/HolidayCard";
import { HOSTING_AHEAD, hostingHoliday } from "@/lib/holidays";
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
  const { supabase, user, profile, others, members } = await requireHome();
  const t = await getT();
  const now = new Date();
  const local = zonedParts(now, profile.timezone);
  const dayAgo = new Date(now.getTime() - 86400000).toISOString();
  const weekAhead = new Date(now.getTime() + 7 * 86400000).toISOString();

  const today = todayKey(profile.timezone, now);
  const lat = profile.lat ?? DEFAULT_PLACE.lat;
  const lon = profile.lon ?? DEFAULT_PLACE.lon;
  const forecastP = getForecast(lat, lon, profile.timezone);
  const holyP = getJewishCalendar(lat, lon, profile.timezone, addDays(today, -2), addDays(today, 14));
  const aheadP = getJewishCalendar(lat, lon, profile.timezone, today, addDays(today, HOSTING_AHEAD));
  const admin = createSupabaseAdmin();
  const [pendingQ, historyQ, automationsQ, sectionsQ, dueQ, wakeQ, trackerQ, memoriesQ, requestsQ, petsQ, activityQ, gmailQ, gcalQ, pushQ, tickedQ, shortcutQ, invitedQ] = await Promise.all([
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
    supabase.from("pets").select("*").order("created_at").returns<Pet[]>(),
    supabase.from("activity").select("id,actor,kind,title,at").gte("at", dayAgo).order("at", { ascending: false }).limit(50).returns<ActivityRow[]>(),
    // Google connections that ended (roadmap 1.9): server-only tables, this user's rows.
    admin.from("gmail_connections").select("section_id,sections(title,icon)").eq("user_id", user.id).eq("status", "expired").returns<{ section_id: string; sections: { title: string; icon: string } | null }[]>(),
    admin.from("calendar_connections").select("status").eq("user_id", user.id).eq("status", "expired").maybeSingle(),
    // "Get set up": what this person has done so far.
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("checkins").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("payload->>source", "shortcut"),
    admin.from("household_invites").select("token", { count: "exact", head: true }).eq("created_by", user.id),
  ]);
  const expiredGoogle: ExpiredGoogle[] = [
    ...(gcalQ.data ? [{ key: "gcal", what: "Google Calendar", href: "/api/google/calendar" }] : []),
    ...(gmailQ.data ?? []).map((g) => ({
      key: g.section_id,
      what: t.today.gmailIn.replace("{space}", `${g.sections?.icon ?? "💳"} ${g.sections?.title ?? ""}`.trim()),
      href: `/api/google/connect?section=${g.section_id}`,
    })),
  ];
  const memberList = members.map((m) => ({ id: m.user_id, name: m.display_name, emoji: m.emoji }));
  const otherMembers = memberList.filter((m) => m.id !== user.id);
  const pets = petsQ.data ?? [];
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
  // Who's on each session today; mine first. Weather warnings are added once the forecast lands.
  const practice = (trackerQ.data ?? [])
    .flatMap((i) => {
      const habit = readHabit(i.props);
      if (!habit || !isDue(habit, today)) return [];
      const section = sectionById0.get(i.section_id);
      const ids = assigneesFor(habit, today, members.map((m) => m.user_id), i.assignee_id ?? section?.owner_id ?? i.created_by);
      return [{ item: i, habit, ids, mine: ids.includes(user.id) }];
    })
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.habit.time.localeCompare(b.habit.time));
  const practiceList = (warnings: Record<string, string | null>) => (
    <TodayPractice
      items={practice.map((p) => p.item)}
      initialCheckins={practice.flatMap((p) => p.item.checkins ?? [])}
      meta={Object.fromEntries(practice.map((p) => [p.item.id, { assignees: p.ids, warning: warnings[p.item.id] ?? null }]))}
      members={memberList}
      userId={user.id}
      timeZone={profile.timezone}
    />
  );
  async function PracticeWithWeather() {
    const hours = (await forecastP)?.hours ?? [];
    return practiceList(
      Object.fromEntries(practice.map((p) => [p.item.id, p.habit.outdoor ? outdoorWarning(weatherAt(hours, today, p.habit.time), { rain: t.daily.rainAt, hot: t.daily.hotAt }) : null])),
    );
  }
  async function Day() {
    const [forecast, holyItems] = await Promise.all([forecastP, holyP]);
    return (
      <DayCard
        weather={forecast?.days.find((d) => d.day === today) ?? null}
        advice={forecast ? walkAdvice(forecast.hours, today) : null}
        holy={holyStatus(holyItems, now)}
        today={today}
        locale={profile.locale}
        place={profile.place ?? DEFAULT_PLACE.name}
      />
    );
  }
  const automations = automationsQ.data ?? [];
  const sections = sectionsQ.data ?? [];
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const awakeToday = (wakeQ.data?.length ?? 0) > 0;
  const canCreate = ["owner", "adult", "teen"].includes(profile.role);
  // A holiday space made in the last month already covers the coming chag.
  const recentHolidaySpace = sections.some((s) => s.template === "holidays" && Date.now() - Date.parse(s.created_at) < 30 * 86400000);
  async function Holiday() {
    const holiday = hostingHoliday(await aheadP, today, recentHolidaySpace);
    return holiday ? <HolidayCard holiday={holiday} householdId={profile.household_id!} userId={user.id} timeZone={profile.timezone} privateOnly={profile.role === "teen"} /> : null;
  }

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

  // Three bands (roadmap 2.2): Now, what needs you; Today, one timeline; Home, the rest.
  const now3 = pending.slice(0, 3);
  const incoming = requests.filter((r) => r.to_user === user.id);
  const dateShort = new Intl.DateTimeFormat(profile.locale, { day: "numeric", month: "short" });

  // When nothing needs you now: the first thing tomorrow, from dated items and automations.
  const tomorrow = addDays(today, 1);
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: profile.timezone, hour: "2-digit", minute: "2-digit" });
  const tomorrowFirst = firstOn(tomorrow, profile.timezone, [
    ...(dueQ.data ?? []).map((i) => ({ at: i.due_at!, title: `${sectionById.get(i.section_id)?.icon ?? ""} ${i.title}`.trim() })),
    ...automations.filter((a) => a.next_run_at).map((a) => ({ at: a.next_run_at!, title: `${a.icon} ${a.name}` })),
  ]);

  return (
    <>
      <RealtimeRefresh tables={["runs", "items", "requests"]} />
      <header className="safe-top mb-2 px-1 pt-2">
        <p className="text-sm font-semibold text-muted">{dateFmt.format(now)}</p>
        <h1 className="mt-1 text-[34px] font-extrabold leading-[1.1] tracking-tight">
          {t.greeting[greetingKey(local.hour)]},<br />
          <span className="bg-linear-to-r from-[#7457ff] to-[#ff6fa8] bg-clip-text text-transparent">{profile.display_name}</span> {profile.emoji}
        </h1>
      </header>

      <SetupChecklist
        fewSpaces={sections.length <= FEW_SPACES && canCreate}
        done={{
          push: (pushQ.count ?? 0) > 0,
          partner: others.length > 0 || (invitedQ.count ?? 0) > 0,
          routine: (tickedQ.count ?? 0) > 0,
          shortcut: (shortcutQ.count ?? 0) > 0,
        }}
      />
      {canCreate && (
        <Suspense fallback={null}>
          <Holiday />
        </Suspense>
      )}
      <AppBadge count={pending.length} />

      {/* Now */}
      <SectionTitle>{t.today.bandNow}</SectionTitle>
      {!awakeToday && local.hour >= 4 && local.hour < 13 && <AwakeButton firstOpen={profile.wake_mode === "first_open"} />}
      <GoogleReconnect expired={expiredGoogle} />
      <RequestCards incoming={incoming} outgoing={requests.filter((r) => r.from_user === user.id)} members={memberList} />
      {now3.length === 0 ? (
        incoming.length === 0 && (
          <Card className="py-5 text-center">
            <p className="font-bold">{t.today.allDone}</p>
            <p className="mt-1 text-sm text-muted">
              {tomorrowFirst ? fill(t.today.tomorrowFirst, { time: hhmm.format(new Date(tomorrowFirst.at)), title: tomorrowFirst.title }) : t.today.nothing}
            </p>
          </Card>
        )
      ) : (
        <div className="space-y-3">
          {now3.map((r) => (
            <RunCard key={r.id} run={r} timeZone={profile.timezone} />
          ))}
        </div>
      )}
      {pending.length > 3 && (
        <div className="mt-3 space-y-3">
          {pending.slice(3).map((r) => (
            <RunCard key={r.id} run={r} timeZone={profile.timezone} />
          ))}
        </div>
      )}

      {/* Today */}
      <SectionTitle action={<Link href="/calendar" className="text-sm font-semibold text-accent">📅 {t.calendar.open} →</Link>}>{t.today.bandToday}</SectionTitle>
      {practice.length > 0 && <Suspense fallback={practiceList({})}><PracticeWithWeather /></Suspense>}
      {((dueQ.data?.length ?? 0) > 0 || upcoming.length > 0) && (
        <Card className="mt-3 divide-y divide-card-border p-0">
          {dueQ.data!.map((i) => {
            const s = sectionById.get(i.section_id);
            return (
              <Link key={i.id} href={`/sections/${i.section_id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg">{s?.icon}</span>
                <span className="flex-1 truncate font-medium">{i.title}</span>
                <span className="text-xs font-semibold text-muted">{dateShort.format(new Date(i.due_at!))}</span>
              </Link>
            );
          })}
          {upcoming.map((a) => (
            <Link key={a.id} href={`/brain/${a.id}`} className="flex items-center gap-3 px-4 py-3">
              <span className="text-lg">{a.icon}</span>
              <span className="flex-1 truncate font-medium">{a.name}</span>
              <span className="text-xs font-semibold text-muted">{timeFmt.format(new Date(a.next_run_at!))}</span>
            </Link>
          ))}
        </Card>
      )}

      {/* Home */}
      <SectionTitle>{t.today.bandHome}</SectionTitle>
      {others.length > 0 ? (
        <>
          <p className="mb-2 px-1 text-sm text-muted">🏠 {others.map((o) => `${o.emoji} ${o.display_name}`).join(" · ")}</p>
          <ActivityStrip initial={activityQ.data ?? []} userId={user.id} members={memberList} />
        </>
      ) : null}
      {/* One swipeable strip: the day (weather, Shabbat) and streaks. */}
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
        <div className={streaks.length > 0 ? "w-[88%] shrink-0 snap-start" : "w-full shrink-0"}>
          <Suspense fallback={<Skeleton className="mb-3 h-36" />}>
            <Day />
          </Suspense>
        </div>
        {streaks.length > 0 && (
          <div className="glass mb-3 w-[70%] shrink-0 snap-start space-y-2 rounded-3xl p-4">
            <p className="text-[13px] font-bold uppercase tracking-wider text-muted">🔥 {t.today.streaks}</p>
            {streaks.map(({ a, n }) => (
              <p key={a.id} className="flex items-center gap-2 text-sm">
                <span>{a.icon}</span>
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="font-bold">🔥 {n}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <QuickActions others={otherMembers} pets={pets.map((pet) => ({ id: pet.id, name: pet.name, emoji: pet.emoji, daysLeft: foodDaysLeft(pet, today) }))} />

      {memories.length > 0 && (
        <>
          <SectionTitle>📸 {t.memories.onThisDay}</SectionTitle>
          <OnThisDay memories={memories} />
        </>
      )}
    </>
  );
}
