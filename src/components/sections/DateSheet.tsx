"use client";
import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button, Chip, Field, Input, Segmented, Sheet, Toggle } from "@/components/ui";
import { todayKey } from "@/lib/engine/habits";
import { DATES_PROP, datePlan, defaultDate, openOccurrence, readDate, type DateSpec } from "@/lib/engine/dates";
import { alertSummary, relativeDay } from "./DatesView";
import type { CheckinRow, Item, Section } from "@/lib/db-types";
import type { Member } from "./PropertyInput";
import { fill } from "@/i18n";
import { GIFTS_PROP, readGifts, type GiftIdea } from "@/lib/gifts";
import { X } from "lucide-react";

/** The stored fields for a reminder-calendar item after editing its date. */
export function datePatch(item: Item, spec: DateSpec, checkins: CheckinRow[], timeZone: string): Partial<Item> {
  const handled = new Set(checkins.filter((c) => c.item_id === item.id && c.status === "done").map((c) => c.day));
  const plan = datePlan(spec, new Date(), timeZone, (d) => handled.has(d));
  const finished = spec.repeat === "once" && handled.has(spec.date);
  return {
    props: { ...item.props, [DATES_PROP]: spec },
    done: finished,
    remind_at: finished ? null : (plan.remindAt?.toISOString() ?? null),
    due_at: plan.dueAt?.toISOString() ?? null,
  };
}

export function DateSheet({
  item,
  section,
  checkins,
  members,
  timeZone,
  onClose,
  onChange,
  onDelete,
  onHandle,
}: {
  item: Item | null;
  section: Section;
  checkins: CheckinRow[];
  members: Member[];
  timeZone: string;
  onClose: () => void;
  onChange: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
  onHandle: (item: Item, handled: boolean) => void;
}) {
  const { t } = useI18n();
  const today = todayKey(timeZone);
  const [title, setTitle] = useState("");
  const [spec, setSpec] = useState<DateSpec>(defaultDate(today));
  const [dirty, setDirty] = useState(false);
  const [idea, setIdea] = useState("");

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setSpec(readDate(item.props) ?? defaultDate(today));
    setDirty(!readDate(item.props));
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const edit = (s: Partial<DateSpec>) => {
    setSpec((prev) => ({ ...prev, ...s }));
    setDirty(true);
  };
  const handled = new Set(checkins.filter((c) => c.status === "done").map((c) => c.day));
  const saved = readDate(item.props);
  const occ = saved ? openOccurrence(saved, today, (d) => handled.has(d)) : null;
  const lastHandled = [...handled].sort().at(-1);
  const isOpenNow = !!occ && occ <= today;

  // Gift ideas save straight away (they don't change the alerts).
  const gifts = readGifts(item.props);
  const setGifts = (next: GiftIdea[]) => onChange(item.id, { props: { ...item.props, [GIFTS_PROP]: next } });

  function save() {
    onChange(item!.id, { title: title.trim() || item!.title, ...datePatch(item!, spec, checkins, timeZone) });
    setDirty(false);
  }

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

        {/* Where it stands */}
        {saved && (
          <div className="rounded-2xl bg-sunken p-3">
            {isOpenNow ? (
              <>
                <p className="mb-2 text-sm font-semibold text-muted">⏰ {t.dates.openNow}</p>
                <Button className="w-full" onClick={() => onHandle(item, true)}>
                  <Check className="size-5" strokeWidth={3} /> {t.dates.stop}
                </Button>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">
                  {occ ? `📅 ${relativeDay(t, today, occ)} · ⏰ ${alertSummary(t, saved)}` : `✓ ${t.dates.handled}`}
                </span>
                {lastHandled && (
                  <button onClick={() => onHandle(item, false)} className="text-sm font-bold text-accent">
                    ↺ {t.dates.undo}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <Field label={t.dates.date}>
          <Input type="date" value={spec.date} onChange={(e) => e.target.value && edit({ date: e.target.value })} className="h-12" />
        </Field>
        <Field label={t.dates.repeat}>
          <Segmented
            value={spec.repeat}
            onChange={(repeat) => edit({ repeat })}
            options={[
              { value: "once", label: t.dates.once },
              { value: "monthly", label: t.dates.monthly },
              { value: "yearly", label: t.dates.yearly },
            ]}
          />
        </Field>

        <Field label={t.dates.alerts}>
          <div className="space-y-3 rounded-2xl bg-sunken p-3">
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4].map((n) => (
                <Chip key={n} active={spec.every === n} onClick={() => edit({ every: n })}>
                  {n ? fill(t.dates.everyH, { n: String(n) }) : t.dates.single}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t.dates.from}>
                <Input type="time" value={spec.from} onChange={(e) => e.target.value && edit({ from: e.target.value })} className="h-11" />
              </Field>
              {spec.every > 0 && (
                <Field label={t.dates.until}>
                  <Input type="time" value={spec.until} onChange={(e) => e.target.value && edit({ until: e.target.value })} className="h-11" />
                </Field>
              )}
            </div>
            <p className="text-xs font-semibold text-muted">⏰ {alertSummary(t, spec)}</p>
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{t.dates.carry}</span>
              <Toggle checked={spec.carry} onChange={(carry) => edit({ carry })} />
            </label>
          </div>
        </Field>

        <Field label={t.dates.ahead}>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 3, 7].map((n) => (
              <Chip key={n} active={spec.ahead === n} onClick={() => edit({ ahead: n })}>
                {n === 0 ? t.dates.none : n === 1 ? t.dates.dayBefore : n === 7 ? t.dates.weekBefore : fill(t.dates.daysBefore, { n: String(n) })}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label={t.dates.gifts}>
          <div className="space-y-2">
            {gifts.map((g, i) => (
              <div key={i} className="flex items-center gap-2 rounded-2xl bg-sunken px-3 py-2">
                <button type="button" onClick={() => setGifts(gifts.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} className="flex-1 text-start">
                  <span className={g.done ? "text-muted line-through" : "font-semibold"}>{g.text}</span>
                </button>
                <button type="button" onClick={() => setGifts(gifts.filter((_, j) => j !== i))} aria-label={t.common.delete} className="text-faint">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!idea.trim()) return;
                setGifts([...gifts, { text: idea.trim() }]);
                setIdea("");
              }}
            >
              <Input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={t.dates.giftAdd} enterKeyHint="done" />
            </form>
          </div>
        </Field>

        {!section.owner_id && members.length > 1 && (
          <Field label={t.dates.who}>
            <div className="flex flex-wrap gap-2">
              <Chip active={!spec.assign} onClick={() => edit({ assign: undefined })}>
                👫 {t.dates.everyone}
              </Chip>
              {members.map((m) => (
                <Chip key={m.id} active={spec.assign?.userId === m.id} onClick={() => edit({ assign: { kind: "person", userId: m.id } })}>
                  {m.emoji} {m.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}
      </div>
    </Sheet>
  );
}
