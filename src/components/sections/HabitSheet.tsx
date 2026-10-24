"use client";
import { useEffect, useState } from "react";
import { AlarmClock, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { Button, Chip, Field, Input, Segmented, Sheet, Toggle } from "@/components/ui";
import { alarmShortcutUrl } from "@/lib/engine/render";
import { habitStats, heatmap, HABIT_PROP, nextReminder, readHabit, todayKey, type Habit } from "@/lib/engine/habits";
import { Ring } from "./TrackerView";
import { CopyField } from "@/components/settings/CopyField";
import type { CheckinRow, Item, Section } from "@/lib/db-types";
import type { Member } from "./PropertyInput";

const HEAT: Record<string, string> = {
  done: "bg-success",
  skipped: "bg-warn/60",
  missed: "bg-danger/30",
  due: "border-2 border-accent/50",
  rest: "bg-sunken",
  future: "bg-sunken/50",
};

function CheckinShortcut({ itemId, hookToken }: { itemId: string; hookToken: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/api/hooks/checkin?token=${hookToken}&item=${itemId}`;
  return (
    <div className="rounded-2xl bg-sunken p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-start font-semibold">
        {t.checkinButton.title}
        <span className="text-faint">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">{t.checkinButton.hint}</p>
          <ol className="space-y-1.5 text-sm">
            {t.checkinButton.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-bold text-accent">{i + 1}.</span> {s}
              </li>
            ))}
          </ol>
          <CopyField label={t.checkinButton.url} value={url} />
          <Button
            variant="soft"
            size="sm"
            onClick={async () => {
              const res = await fetch(url, { method: "POST" });
              const body = await res.json().catch(() => ({}));
              setResult(body.message ?? body.error ?? String(res.status));
            }}
          >
            {t.checkinButton.test}
          </Button>
          {result && <p className="text-sm font-semibold">{result}</p>}
        </div>
      )}
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button className="size-11 rounded-2xl bg-card-solid text-xl font-bold" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className="min-w-8 text-center text-xl font-extrabold">{value}</span>
      <button className="size-11 rounded-2xl bg-card-solid text-xl font-bold" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

function defaultHabit(today: string): Habit {
  return { repeat: { kind: "interval", every: 1, start: today }, time: "18:00", nudge: true, outdoor: false };
}

export function HabitSheet({
  item,
  section,
  checkins,
  members,
  timeZone,
  onClose,
  onChange,
  onDelete,
  onCheckIn,
  userId,
  hookToken,
}: {
  item: Item | null;
  section: Section;
  checkins: CheckinRow[];
  members: Member[];
  timeZone: string;
  onClose: () => void;
  onChange: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
  onCheckIn: (item: Item, status: "done" | "skipped" | null) => void;
  userId: string;
  hookToken: string;
}) {
  const { t, locale } = useI18n();
  const today = todayKey(timeZone);
  const [title, setTitle] = useState("");
  const [habit, setHabit] = useState<Habit>(defaultHabit(today));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setHabit(readHabit(item.props) ?? defaultHabit(today));
    setDirty(!readHabit(item.props));
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const saved = readHabit(item.props);
  const stats = habitStats(saved, checkins, today);
  const cells = heatmap(saved, checkins, today, 12);
  const todays = checkins.find((c) => c.day === today);
  const edit = (h: Habit) => {
    setHabit(h);
    setDirty(true);
  };

  function save() {
    const done = new Set(checkins.map((c) => c.day));
    const next = nextReminder(habit, new Date(), timeZone, (d) => done.has(d));
    onChange(item!.id, {
      title: title.trim() || item!.title,
      props: { ...item!.props, [HABIT_PROP]: habit },
      remind_at: next?.at.toISOString() ?? null,
    });
    setDirty(false);
  }

  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${section.icon} ${section.title}`}
      footer={
        <div className="flex gap-2">
          {dirty && (
            <Button size="lg" className="flex-1" onClick={save}>
              {t.common.saveChanges}
            </Button>
          )}
          <Button size="lg" variant="danger" className={dirty ? "" : "flex-1"} onClick={() => onDelete(item.id)} aria-label={t.common.delete}>
            <Trash2 className="size-5" /> {dirty ? "" : t.common.delete}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-4">
        <Input value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} className="h-14 text-lg font-bold" />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-sunken p-3">
            <p className="text-2xl font-extrabold text-[#ff7a1a]">🔥 {stats.streak}</p>
            <p className="text-xs font-semibold text-muted">{t.tracker.streak}</p>
          </div>
          <div className="rounded-2xl bg-sunken p-3">
            <p className="text-2xl font-extrabold">🏆 {stats.best}</p>
            <p className="text-xs font-semibold text-muted">{t.tracker.best}</p>
          </div>
          <div className="flex flex-col items-center rounded-2xl bg-sunken p-2">
            <Ring value={stats.rate} size={40} />
            <p className="mt-1 text-xs font-semibold text-muted">{t.tracker.rate}</p>
          </div>
        </div>

        {/* Heatmap: 12 weeks, columns = weeks */}
        <div className="grid grid-flow-col grid-rows-7 gap-1" dir="ltr">
          {cells.map((c) => (
            <span key={c.day} title={c.day} className={cn("aspect-square rounded-[4px]", HEAT[c.state], c.day === today && "ring-2 ring-fg/60")} />
          ))}
        </div>

        {/* Today */}
        {(stats.dueToday || !saved) && (
          <div className="flex gap-2">
            <Button className="flex-1" variant={todays?.status === "done" ? "ghost" : "primary"} onClick={() => onCheckIn(item, todays?.status === "done" ? null : "done")}>
              {todays?.status === "done" ? `↺ ${t.tracker.undo}` : `✓ ${t.tracker.checkIn}`}
            </Button>
            {!todays && (
              <Button variant="soft" onClick={() => onCheckIn(item, "skipped")}>
                {t.tracker.skip}
              </Button>
            )}
          </div>
        )}

        {/* Schedule */}
        <Field label={t.tracker.schedule}>
          <div className="space-y-3 rounded-2xl bg-sunken p-3">
            <Segmented
              value={habit.repeat.kind}
              onChange={(kind) =>
                edit({
                  ...habit,
                  repeat:
                    kind === "interval"
                      ? { kind, every: 1, start: today }
                      : kind === "weekly"
                        ? { kind, days: [0, 1, 2, 3, 4] }
                        : { kind, day: +today.slice(8, 10), every: 1, start: `${today.slice(0, 8)}01` },
                })
              }
              options={[
                { value: "interval", label: t.tracker.interval },
                { value: "weekly", label: t.tracker.weekly },
                { value: "monthly", label: t.tracker.monthly },
              ]}
            />
            {habit.repeat.kind === "interval" ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label={`${t.tracker.every} (${t.tracker.days})`}>
                  <Stepper value={habit.repeat.every} min={1} max={365} onChange={(every) => habit.repeat.kind === "interval" && edit({ ...habit, repeat: { ...habit.repeat, every } })} />
                </Field>
                <Field label={t.tracker.startDate}>
                  <Input type="date" value={habit.repeat.start} onChange={(e) => e.target.value && habit.repeat.kind === "interval" && edit({ ...habit, repeat: { ...habit.repeat, start: e.target.value } })} className="h-11" />
                </Field>
              </div>
            ) : habit.repeat.kind === "monthly" ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t.tracker.dayOfMonth}>
                  <Stepper value={habit.repeat.day} min={1} max={31} onChange={(day) => habit.repeat.kind === "monthly" && edit({ ...habit, repeat: { ...habit.repeat, day } })} />
                </Field>
                <Field label={`${t.tracker.every} (${t.tracker.months})`}>
                  <Stepper value={habit.repeat.every} min={1} max={12} onChange={(every) => habit.repeat.kind === "monthly" && edit({ ...habit, repeat: { ...habit.repeat, every } })} />
                </Field>
              </div>
            ) : (
              <div className="flex justify-between gap-1">
                {t.weekdaysShort.map((label, d) => {
                  const days = habit.repeat.kind === "weekly" ? habit.repeat.days : [];
                  return (
                    <Chip key={d} active={days.includes(d)} className="h-10 flex-1 px-0" onClick={() => {
                      const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
                      if (next.length) edit({ ...habit, repeat: { kind: "weekly", days: next } });
                    }}>
                      {label}
                    </Chip>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Field label={t.tracker.time}>
                <Input type="time" value={habit.time} onChange={(e) => e.target.value && edit({ ...habit, time: e.target.value })} className="h-11 w-32" />
              </Field>
              <a href={alarmShortcutUrl(habit.time, title || item.title)} className="mt-6 inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-card-solid text-sm font-semibold">
                <AlarmClock className="size-4" /> {t.tracker.setAlarm} {habit.time}
              </a>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t.tracker.nudge}</span>
              <Toggle checked={habit.nudge} onChange={(nudge) => edit({ ...habit, nudge })} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t.daily.outdoor}</span>
              <Toggle checked={habit.outdoor} onChange={(outdoor) => edit({ ...habit, outdoor })} />
            </label>
            {!section.owner_id && members.length > 1 && (
              <div>
                <p className="mb-1.5 text-sm font-medium">{t.daily.whoDoes}</p>
                <div className="flex flex-wrap gap-2">
                  <Chip active={!habit.assign} onClick={() => edit({ ...habit, assign: undefined })}>
                    {t.daily.anyone}
                  </Chip>
                  {members.map((m) => (
                    <Chip key={m.id} active={habit.assign?.kind === "person" && habit.assign.userId === m.id} onClick={() => edit({ ...habit, assign: { kind: "person", userId: m.id } })}>
                      {m.emoji} {m.name}
                    </Chip>
                  ))}
                  <Chip active={habit.assign?.kind === "both"} onClick={() => edit({ ...habit, assign: { kind: "both" } })}>
                    👫 {t.daily.both}
                  </Chip>
                  <Chip
                    active={habit.assign?.kind === "alternate"}
                    onClick={() => edit({ ...habit, assign: { kind: "alternate", users: [userId, ...members.map((m) => m.id).filter((id) => id !== userId)], start: today } })}
                  >
                    🔁 {t.daily.alternate}
                  </Chip>
                </div>
              </div>
            )}
          </div>
        </Field>

        {/* One-tap check-in from the iPhone (Shortcut → Home Screen / Action Button / Siri) */}
        {saved && <CheckinShortcut itemId={item.id} hookToken={hookToken} />}

        {/* History */}
        {checkins.length > 0 && (
          <Field label={`${t.tracker.history} · ${stats.total} ${t.tracker.total}`}>
            <ul className="divide-y divide-card-border rounded-2xl bg-sunken">
              {[...checkins].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 8).map((c) => {
                const m = members.find((x) => x.id === c.user_id);
                return (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{dayFmt.format(new Date(`${c.day}T12:00:00Z`))}</span>
                    <span className="font-semibold">
                      {c.status === "done" ? "✓" : "⏭"} {m ? `${m.emoji} ${m.name}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Field>
        )}

      </div>
    </Sheet>
  );
}
