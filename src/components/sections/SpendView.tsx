"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { cn } from "@/lib/cn";
import { monthOf, readTx, summarizeMonth, type Tx } from "@/lib/spend";
import { Button, Input } from "@/components/ui";
import { SwipeRow } from "./SwipeRow";
import type { Item, Section } from "@/lib/db-types";

const shekels = (n: number) => `₪${Math.round(n).toLocaleString()}`;
const money = (t: Tx) => (t.currency === "₪" ? `₪${t.amount.toLocaleString()}` : `${t.currency}${t.amount}`);

function lastMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Spending: purchases forwarded from Max / bank texts, with this month's total and where it went. */
export function SpendView({
  section,
  items,
  timeZone,
  onDelete,
  onSettings,
}: {
  section: Section;
  items: Item[];
  timeZone: string;
  onDelete: (id: string) => void;
  onSettings: (settings: NonNullable<Section["settings"]>) => void;
}) {
  const { t, locale } = useI18n();
  const all = items
    .map((item) => ({ item, tx: readTx(item.props) }))
    .filter((x): x is { item: Item; tx: Tx } => !!x.tx)
    .sort((a, b) => b.tx.at.localeCompare(a.tx.at));
  const month = monthOf(new Date().toISOString(), timeZone);
  const sum = summarizeMonth(all.map((x) => x.tx), month, timeZone);
  const prev = summarizeMonth(all.map((x) => x.tx), lastMonth(month), timeZone);
  const top = sum.byCategory[0]?.amount ?? 1;
  const day = new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric", month: "short" });
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" });

  const groups: { day: string; rows: typeof all }[] = [];
  for (const x of all.slice(0, 200)) {
    const d = day.format(new Date(x.tx.at));
    if (groups.at(-1)?.day !== d) groups.push({ day: d, rows: [] });
    groups.at(-1)!.rows.push(x);
  }

  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-4">
        <p className="text-xs font-semibold text-muted">
          {t.spend.month} · {t.spend.total}
        </p>
        <p className="text-[40px] font-extrabold leading-tight tabular-nums">{shekels(sum.total)}</p>
        <p className="text-xs text-muted">
          {fill(t.spend.purchases, { n: sum.count })}
          {prev.count > 0 && ` · ${fill(t.spend.vsLast, { diff: `${sum.total >= prev.total ? "+" : "−"}${shekels(Math.abs(sum.total - prev.total))}` })}`}
        </p>
        {sum.byCategory.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <p className="text-xs font-bold text-muted">{t.spend.byCategory}</p>
            {sum.byCategory.map((c) => (
              <div key={c.category} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 truncate font-semibold">{t.spend.categories[c.category]}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(c.amount / top) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-end tabular-nums text-muted">{shekels(c.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {all.length === 0 && <p className="glass rounded-3xl px-4 py-10 text-center text-muted">{t.spend.empty}</p>}

      {groups.map((g) => (
        <section key={g.day} className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-muted">{g.day}</h2>
          {g.rows.map(({ item, tx }) => (
            <SwipeRow key={item.id} onDelete={() => onDelete(item.id)} className="rounded-3xl">
              <div className="glass flex items-center gap-3 rounded-3xl px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.title}</p>
                  <p className="text-xs text-muted">
                    {t.spend.categories[tx.category]} · {time.format(new Date(tx.at))}
                    {tx.card && ` · •${tx.card}`}
                    {tx.refund && ` · ${t.spend.refund}`}
                  </p>
                </div>
                <span className={cn("font-bold tabular-nums", tx.refund && "text-success")}>{tx.refund ? `+${money(tx)}` : money(tx)}</span>
              </div>
            </SwipeRow>
          ))}
        </section>
      ))}

      <Cards cards={section.settings?.cards ?? []} onChange={(cards) => onSettings({ ...section.settings, cards })} />
    </div>
  );
}

/** Which cards / accounts land in this space, by their last 4 digits. */
function Cards({ cards, onChange }: { cards: string[]; onChange: (cards: string[]) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const valid = /^\d{4}$/.test(value) && !cards.includes(value);
  return (
    <div className="glass space-y-2 rounded-3xl p-4">
      <p className="text-sm font-bold">💳 {t.spend.cards}</p>
      <p className="text-xs text-muted">{t.spend.cardsHint}</p>
      <div className="flex flex-wrap gap-2">
        {cards.map((c) => (
          <span key={c} className="flex items-center gap-1 rounded-full bg-sunken px-3 py-1 text-sm font-semibold tabular-nums">
            •{c}
            <button onClick={() => onChange(cards.filter((x) => x !== c))} aria-label={t.common.delete}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onChange([...cards, value]);
          setValue("");
        }}
      >
        <Input inputMode="numeric" maxLength={4} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} placeholder="1234" className="h-10 min-w-0 flex-1" />
        <Button size="sm" variant="soft" disabled={!valid}>
          + {t.spend.addCard}
        </Button>
      </form>
    </div>
  );
}
