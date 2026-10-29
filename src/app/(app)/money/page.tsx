import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { todayKey } from "@/lib/engine/habits";
import { loadMonth } from "@/lib/money-data";
import { settleUp } from "@/lib/money";
import { fill } from "@/i18n";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { MoneyEditor } from "@/components/money/MoneyEditor";

const shift = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Household money (roadmap 3.6): the month across spending, subscriptions and bills; budgets; settle-up. */
export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { supabase, profile, household, members } = await requireHome();
  const t = await getT();
  const current = todayKey(profile.timezone).slice(0, 7);
  const asked = (await searchParams).m;
  const month = asked && /^\d{4}-\d{2}$/.test(asked) ? asked : current;
  const [data, last] = await Promise.all([loadMonth(supabase, household.id, month, profile.timezone), loadMonth(supabase, household.id, shift(month, -1), profile.timezone)]);
  const money = (n: number) => new Intl.NumberFormat(profile.locale, { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
  const name = (id: string) => {
    const m = members.find((x) => x.user_id === id);
    return m ? `${m.emoji} ${m.display_name}` : "—";
  };
  const transfers = settleUp(data.paidBy, members.map((m) => m.user_id));
  const label = new Intl.DateTimeFormat(profile.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  const nav = "flex size-10 items-center justify-center rounded-full bg-sunken";

  return (
    <>
      <PageHeader
        title={t.money.title}
        subtitle={label}
        action={
          <div className="flex gap-2">
            <Link href={`/money?m=${shift(month, -1)}`} aria-label={t.money.prev} className={nav}>
              <ChevronLeft className="size-5 rtl:rotate-180" />
            </Link>
            {month < current && (
              <Link href={`/money?m=${shift(month, 1)}`} aria-label={t.money.next} className={nav}>
                <ChevronRight className="size-5 rtl:rotate-180" />
              </Link>
            )}
          </div>
        }
      />
      <Card className="text-center">
        <p className="text-sm font-semibold text-muted">{t.money.total}</p>
        <p className="text-4xl font-extrabold tabular-nums">{money(data.total)}</p>
        {last.total > 0 && <p className="text-sm text-muted">{fill(t.money.vsLast, { amount: money(last.total) })}</p>}
      </Card>

      <SectionTitle>{t.money.byCategory}</SectionTitle>
      <Card className="space-y-3">
        {data.byCategory.length === 0 && <p className="text-center text-sm text-muted">{t.money.empty}</p>}
        {data.byCategory.map((c) => {
          const over = c.budget !== null && c.amount > c.budget;
          const pct = c.budget ? Math.min(100, (c.amount / c.budget) * 100) : 0;
          return (
            <div key={c.category}>
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{t.spend.categories[c.category] ?? c.category}</span>
                <span className={over ? "font-bold text-danger tabular-nums" : "tabular-nums"}>
                  {money(c.amount)}
                  {c.budget !== null && <span className="text-muted"> / {money(c.budget)}</span>}
                </span>
              </div>
              {c.budget !== null && (
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={over ? "h-full bg-danger" : "h-full bg-accent"} style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {members.length > 1 && (
        <>
          <SectionTitle>{t.money.whoPaid}</SectionTitle>
          <Card className="space-y-2">
            {members.map((m) => (
              <div key={m.user_id} className="flex justify-between">
                <span>{name(m.user_id)}</span>
                <span className="tabular-nums">{money(data.paidBy[m.user_id] ?? 0)}</span>
              </div>
            ))}
            <div className="border-t border-card-border pt-2 text-sm font-semibold">
              {transfers.length === 0 ? t.money.even : transfers.map((x, n) => <p key={n}>{fill(t.money.owes, { from: name(x.from), to: name(x.to), amount: money(x.amount) })}</p>)}
            </div>
          </Card>
        </>
      )}

      <MoneyEditor bills={data.billItems} budgets={Object.fromEntries(data.byCategory.filter((c) => c.budget !== null).map((c) => [c.category, c.budget!]))} categories={data.byCategory.map((c) => c.category)} />
    </>
  );
}
