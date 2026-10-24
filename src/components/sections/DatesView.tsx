"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { addDays, diffDays, todayKey } from "@/lib/engine/habits";
import { alertTimes, CARRY_DAYS, occursOn, openOccurrence, readDate, type DateSpec } from "@/lib/engine/dates";
import { RemoveBadge, SwipeRow } from "./SwipeRow";
import type { CheckinRow, Item } from "@/lib/db-types";

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

/** "Today" / "Tomorrow" / "In 5 days" / "3 days ago". */
export function relativeDay(t: ReturnType<typeof useI18n>["t"], today: string, day: string) {
  const n = diffDays(today, day);
  if (n === 0) return t.dates.today;
  if (n === 1) return t.dates.tomorrow;
  return n > 0 ? t.dates.inDays.replace("{n}", String(n)) : t.dates.daysAgo.replace("{n}", String(-n));
}

/** "5× 09:00–21:00" or "09:00". */
export function alertSummary(t: ReturnType<typeof useI18n>["t"], spec: DateSpec) {
  const times = alertTimes(spec);
  return times.length > 1 ? t.dates.summary.replace("{n}", String(times.length)).replace("{from}", spec.from).replace("{until}", times.at(-1)!) : t.dates.summaryOnce.replace("{from}", spec.from);
}

/** Days each item counts as handled ("No more needed"). */
export function handledByItem(checkins: CheckinRow[]) {
  const map = new Map<string, Set<string>>();
  for (const c of checkins) if (c.status === "done") map.set(c.item_id, (map.get(c.item_id) ?? new Set()).add(c.day));
  return map;
}

/**
 * Reminder calendar: a month grid with a dot per date, the chosen day's
 * reminders, then everything coming up.
 */
export function DatesView({
  items,
  checkins,
  timeZone,
  selected,
  onSelect,
  onOpen,
  onHandle,
  editing,
  onDelete,
}: {
  items: Item[];
  checkins: CheckinRow[];
  timeZone: string;
  selected: string;
  onSelect: (day: string) => void;
  onOpen: (item: Item) => void;
  onHandle: (item: Item, handled: boolean) => void;
  editing: boolean;
  onDelete: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const today = todayKey(timeZone);
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [showPast, setShowPast] = useState(false);
  const handled = useMemo(() => handledByItem(checkins), [checkins]);

  const dated = items.filter((i) => !i.done && readDate(i.props)).map((i) => ({ item: i, spec: readDate(i.props)!, done: handled.get(i.id) ?? new Set<string>() }));
  const undated = items.filter((i) => !i.done && !readDate(i.props));
  const past = items.filter((i) => i.done);

  // Month grid (Sunday first, like t.weekdaysShort).
  const first = `${month}-01`;
  const lead = asDate(first).getUTCDay();
  const length = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const days = Array.from({ length }, (_, i) => addDays(first, i));
  const shiftMonth = (n: number) => {
    const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  // Open now = today's date, or an earlier one still nagging (carry).
  const openNow = (d: (typeof dated)[number]) => {
    const occ = openOccurrence(d.spec, today, (x) => d.done.has(x));
    return occ && diffDays(occ, today) >= 0 && (occ === today || (d.spec.carry && diffDays(occ, today) <= CARRY_DAYS)) ? occ : null;
  };
  const onDay = dated.filter((d) => occursOn(d.spec, selected) || (selected === today && openNow(d)));
  const upcoming = dated
    .map((d) => ({ ...d, next: openOccurrence(d.spec, today, (x) => d.done.has(x)) }))
    .filter((d) => d.next)
    .sort((a, b) => a.next!.localeCompare(b.next!));

  const row = (d: (typeof dated)[number], day: string) => {
    const open = openNow(d);
    const isHandled = d.done.has(day);
    return (
      <div key={`${d.item.id}-${day}`} className="flex items-center gap-2">
        <AnimatePresence>{editing && <RemoveBadge onClick={() => onDelete(d.item.id)} />}</AnimatePresence>
        <SwipeRow onDelete={() => onDelete(d.item.id)} className="min-w-0 flex-1 rounded-3xl">
          <div className={cn("glass flex gap-3 rounded-3xl p-3", open === day ? "flex-col" : "items-center")}>
            <button onClick={() => onOpen(d.item)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
              <span className={cn("flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl leading-none", open ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent")}>
                <span className="text-[10px] font-bold uppercase">{new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(asDate(day))}</span>
                <span className="text-lg font-extrabold">{+day.slice(8, 10)}</span>
              </span>
              <span className="min-w-0">
                <span className={cn("block truncate font-bold", isHandled && "text-muted line-through")}>{d.item.title}</span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {relativeDay(t, today, day)}
                  {d.spec.repeat !== "once" && (
                    <>
                      {" · "}
                      <Repeat className="size-3" /> {d.spec.repeat === "yearly" ? t.dates.yearly : t.dates.monthly}
                    </>
                  )}
                  {" · ⏰ "}
                  {alertSummary(t, d.spec)}
                </span>
              </span>
            </button>
            {open === day ? (
              <Button onClick={() => onHandle(d.item, true)} className="w-full">
                <Check className="size-4" strokeWidth={3} /> {t.dates.stop}
              </Button>
            ) : isHandled ? (
              <button onClick={() => onHandle(d.item, false)} className="shrink-0 rounded-full bg-success/12 px-3 py-1.5 text-xs font-bold text-success">
                ✓ {t.dates.handled}
              </button>
            ) : null}
          </div>
        </SwipeRow>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Month */}
      <div className="glass rounded-3xl p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <button onClick={() => shiftMonth(-1)} className="flex size-9 items-center justify-center rounded-full bg-sunken" aria-label="Previous month">
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </button>
          <button onClick={() => (setMonth(today.slice(0, 7)), onSelect(today))} className="text-base font-extrabold">
            {monthFmt.format(asDate(first))}
          </button>
          <button onClick={() => shiftMonth(1)} className="flex size-9 items-center justify-center rounded-full bg-sunken" aria-label="Next month">
            <ChevronRight className="size-5 rtl:rotate-180" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {t.weekdaysShort.map((w) => (
            <span key={w} className="pb-1 text-[11px] font-bold uppercase text-faint">
              {w}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {days.map((day) => {
            const marks = dated.filter((d) => occursOn(d.spec, day));
            const isSel = day === selected;
            return (
              <motion.button
                key={day}
                whileTap={{ scale: 0.88 }}
                onClick={() => onSelect(day)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-2xl text-sm font-semibold transition-colors",
                  isSel ? "bg-accent text-accent-fg" : day === today ? "bg-accent-soft text-accent" : diffDays(today, day) < 0 ? "text-faint" : "",
                )}
              >
                {+day.slice(8, 10)}
                {marks.length > 0 && (
                  <span className="absolute bottom-1.5 flex gap-0.5">
                    {marks.slice(0, 3).map((d) => (
                      <span key={d.item.id} className={cn("size-1.5 rounded-full", isSel ? "bg-accent-fg" : d.done.has(day) ? "bg-success" : "bg-accent")} />
                    ))}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Chosen day */}
      <div>
        <p className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wider text-muted">{dayFmt.format(asDate(selected))}</p>
        {onDay.length ? (
          <div className="space-y-2">{onDay.map((d) => row(d, occursOn(d.spec, selected) ? selected : openNow(d)!))}</div>
        ) : (
          <p className="rounded-3xl border-2 border-dashed border-card-border px-4 py-5 text-center text-sm text-muted">
            {t.dates.nothingOn} · {t.dates.addOn.replace("{date}", new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(asDate(selected)))} ↓
          </p>
        )}
      </div>

      {/* Coming up */}
      {upcoming.filter((d) => d.next !== selected).length > 0 && (
        <div>
          <p className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wider text-muted">{t.dates.upcoming}</p>
          <div className="space-y-2">{upcoming.filter((d) => d.next !== selected).map((d) => row(d, d.next!))}</div>
        </div>
      )}

      {/* Not dated yet (e.g. from a template) */}
      {undated.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wider text-muted">{t.dates.noDate}</p>
          <ul className="glass divide-y divide-card-border overflow-hidden rounded-3xl">
            {undated.map((i) => (
              <li key={i.id} className="flex items-center gap-2 px-4">
                <AnimatePresence>{editing && <RemoveBadge onClick={() => onDelete(i.id)} />}</AnimatePresence>
                <button onClick={() => onOpen(i)} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3.5 text-start">
                  <span className="truncate font-medium">{i.title}</span>
                  <span className="shrink-0 text-xs font-semibold text-accent">📅 {t.dates.setDate}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <button onClick={() => setShowPast((v) => !v)} className="px-1 text-sm font-semibold text-muted">
            {showPast ? t.sections.hideDone : t.sections.showDone} ({past.length})
          </button>
          {showPast && (
            <ul className="glass mt-2 divide-y divide-card-border overflow-hidden rounded-3xl opacity-70">
              {past.map((i) => (
                <li key={i.id} className="flex items-center gap-2 px-4">
                  <AnimatePresence>{editing && <RemoveBadge onClick={() => onDelete(i.id)} />}</AnimatePresence>
                  <button onClick={() => onOpen(i)} className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 text-start">
                    <span className="truncate text-muted line-through">{i.title}</span>
                    <span className="shrink-0 text-xs text-faint">{readDate(i.props)?.date}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
