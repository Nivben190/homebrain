import Link from "next/link";
import { requireHome, getT } from "@/lib/session";
import { loadWeek } from "@/lib/weekly";
import { fill } from "@/i18n";
import { Card, PageHeader, SectionTitle } from "@/components/ui";

/** The Sunday check-in (roadmap 3.8): a page to look at together instead of a blank. */
export default async function WeeklyPage() {
  const { supabase, profile, household, members } = await requireHome();
  const t = await getT();
  const w = t.weekly;
  const week = await loadWeek(supabase, household.id);
  const name = (id: string | null) => {
    const m = members.find((x) => x.user_id === id);
    return m ? `${m.emoji} ${m.display_name}` : w.someone;
  };
  const money = (n: number) => new Intl.NumberFormat(profile.locale, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
  const when = new Intl.DateTimeFormat(profile.locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: profile.timezone });
  const diff = week.spent - week.spentBefore;

  return (
    <>
      <PageHeader title={w.title} subtitle={w.subtitle} />

      <SectionTitle>✅ {w.done}</SectionTitle>
      <Card className="space-y-1.5">
        {week.done.length === 0 ? <p className="text-sm text-muted">{w.quiet}</p> : week.done.map((d) => <p key={d.actor ?? "?"}>{fill(w.doneBy, { name: name(d.actor), n: d.count })}</p>)}
      </Card>

      {week.sessions.length > 0 && (
        <>
          <SectionTitle>🔥 {w.sessions}</SectionTitle>
          <Card className="space-y-1.5">
            {week.sessions.map((s) => (
              <p key={s.title} className="flex justify-between">
                <span>{s.title}</span>
                <span className="font-semibold tabular-nums">×{s.done}</span>
              </p>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>💰 {w.money}</SectionTitle>
      <Card>
        <p className="text-2xl font-extrabold tabular-nums">{money(week.spent)}</p>
        <p className="text-sm text-muted">{fill(diff > 0 ? w.more : diff < 0 ? w.less : w.same, { amount: money(Math.abs(diff)) })}</p>
        <Link href="/money" className="mt-2 inline-block text-sm font-semibold text-accent">
          {t.money.title} →
        </Link>
      </Card>

      <SectionTitle>📅 {w.coming}</SectionTitle>
      <Card className="divide-y divide-card-border p-0">
        {week.coming.length === 0 && <p className="p-4 text-sm text-muted">{t.calendar.free}</p>}
        {week.coming.map((c, n) => (
          <Link key={n} href={`/sections/${c.section_id}`} className="flex justify-between gap-3 px-4 py-3">
            <span className="truncate font-medium">{c.title}</span>
            <span className="shrink-0 text-xs text-muted">{when.format(new Date(c.due_at))}</span>
          </Link>
        ))}
      </Card>

      {week.requests.length > 0 && (
        <>
          <SectionTitle>💌 {w.requests}</SectionTitle>
          <Card className="space-y-1.5">
            {week.requests.map((r, n) => (
              <p key={n}>
                {name(r.from_user)} → {name(r.to_user)}: {r.text}
              </p>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
