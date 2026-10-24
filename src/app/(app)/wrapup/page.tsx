import { requireHome } from "@/lib/session";
import { buildDay, dayScore } from "@/lib/day";
import { WrapupScreen } from "@/components/today/WrapupScreen";

export default async function WrapupPage() {
  const { supabase, profile, members } = await requireHome();
  const ids = members.map((m) => m.user_id);
  const now = new Date();
  const [today, tomorrow] = await Promise.all([buildDay(supabase, profile, ids, now), buildDay(supabase, profile, ids, new Date(now.getTime() + 86400000))]);
  const first = tomorrow.sessions.filter((s) => s.mine).sort((a, b) => a.habit.time.localeCompare(b.habit.time))[0] ?? null;

  return (
    <WrapupScreen
      score={dayScore(today)}
      sessions={today.sessions.filter((s) => s.mine).map((s) => ({ id: s.item.id, title: s.item.title, icon: s.section.icon, done: !!s.done }))}
      due={today.due.map((i) => ({ id: i.id, title: i.title, done: i.done }))}
      requests={today.requests.map((r) => ({ id: r.id, title: r.text, done: r.status === "done" }))}
      tomorrowFirst={first ? { title: first.item.title, icon: first.section.icon, time: first.habit.time } : null}
      timeZone={profile.timezone}
    />
  );
}
