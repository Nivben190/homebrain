"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { cn } from "@/lib/cn";
import { todayKey } from "@/lib/engine/habits";
import { landingRotation, pickWinner, readWheel, REST_DAYS, spinnable, wheelProps, type WheelOption } from "@/lib/wheel";
import { Button, Chip, Input } from "@/components/ui";
import type { Item, Section } from "@/lib/db-types";

const COLORS = ["#7457ff", "#ff6fa8", "#ffb340", "#34c77b", "#38b6ff", "#ff7a59", "#b65cff", "#2ec4b6"];
const SPIN_MS = 4200;

/**
 * "Spin the wheel": pick one of the space's saved wheels, spin it, and keep
 * (or edit) its options for next time.
 */
export function WheelView({
  section,
  items,
  timeZone,
  onUpdate,
  onDelete,
}: {
  section: Section;
  items: Item[];
  timeZone: string;
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const storeKey = `hb_wheel_${section.id}`;
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const seen = useRef(new Set(items.map((i) => i.id)));

  // Remember the last wheel per space on this phone.
  useEffect(() => {
    try {
      const id = localStorage.getItem(storeKey);
      if (id && items.some((i) => i.id === id)) setSelected(id);
    } catch {
      // No storage: start from the first wheel.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A wheel just added from the bar: select it and open its options.
  useEffect(() => {
    const fresh = items.find((i) => !seen.current.has(i.id));
    for (const i of items) seen.current.add(i.id);
    if (fresh) {
      choose(fresh.id);
      setEditing(true);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(id: string) {
    setSelected(id);
    try {
      localStorage.setItem(storeKey, id);
    } catch {
      // Not remembered; fine.
    }
  }

  const wheel = items.find((i) => i.id === selected) ?? items[0];
  if (!wheel) return <p className="glass rounded-3xl px-4 py-10 text-center text-muted">{t.wheel.empty}</p>;

  return (
    <div className="space-y-4">
      {items.length > 1 && (
        <div>
          <p className="mb-2 px-1 text-sm font-semibold text-muted">{t.wheel.pick}</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {items.map((i) => (
              <Chip
                key={i.id}
                active={i.id === wheel.id}
                onClick={() => {
                  choose(i.id);
                  setEditing(false);
                }}
                className="shrink-0"
              >
                {i.title}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {editing ? (
        <WheelEditor
          key={wheel.id}
          item={wheel}
          onSave={(patch) => {
            onUpdate(wheel.id, patch);
            setEditing(false);
          }}
          onDelete={() => {
            setEditing(false);
            setSelected(null);
            onDelete(wheel.id);
          }}
        />
      ) : (
        <Spinner key={wheel.id} item={wheel} timeZone={timeZone} onUpdate={(patch) => onUpdate(wheel.id, patch)} onEdit={() => setEditing(true)} />
      )}
    </div>
  );
}

function Spinner({ item, timeZone, onUpdate, onEdit }: { item: Item; timeZone: string; onUpdate: (patch: Partial<Item>) => void; onEdit: () => void }) {
  const { t } = useI18n();
  const spec = readWheel(item.props);
  const options = spec.options;
  const today = todayKey(timeZone);
  const live = useMemo(() => new Set(spinnable(options, today)), [options, today]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<number | null>(null);

  function spin() {
    if (spinning || options.length < 2) return;
    const w = pickWinner(options, today);
    setWinner(null);
    setSpinning(true);
    setRotation((r) => landingRotation(r, w, options.length, 5 + Math.floor(Math.random() * 3), Math.random()));
    navigator.vibrate?.(15);
    setTimeout(() => {
      setSpinning(false);
      setWinner(w);
      navigator.vibrate?.([20, 40, 20]);
      onUpdate({ props: wheelProps(item.props, { ...spec, last: options[w].label }) });
    }, SPIN_MS);
  }

  function didIt(i: number) {
    const next = options.map((o, j) => (j === i ? { ...o, doneDay: today } : o));
    onUpdate({ props: wheelProps(item.props, { ...spec, options: next }) });
    setWinner(null);
  }

  const n = Math.max(options.length, 1);
  const slice = 360 / n;
  const R = 150;
  const point = (deg: number, r = R) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [R + r * Math.cos(a), R + r * Math.sin(a)];
  };

  return (
    <div className="space-y-4">
      <div className="glass relative mx-auto aspect-square w-full max-w-[340px] rounded-full p-3">
        {/* Pointer */}
        <div className="absolute start-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 rtl:translate-x-1/2">
          <div className="size-0 border-x-[14px] border-t-[24px] border-x-transparent border-t-fg drop-shadow" />
        </div>
        <svg
          viewBox={`0 0 ${R * 2} ${R * 2}`}
          className="size-full"
          style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.8, 0.2, 1)` : undefined }}
          onClick={spin}
        >
          {options.length === 0 && <circle cx={R} cy={R} r={R} className="fill-sunken" />}
          {options.length === 1 && <circle cx={R} cy={R} r={R} fill={COLORS[0]} />}
          {options.length > 1 &&
            options.map((o, i) => {
              const [x1, y1] = point(i * slice);
              const [x2, y2] = point((i + 1) * slice);
              return (
                <path
                  key={i}
                  d={`M${R},${R} L${x1},${y1} A${R},${R} 0 ${slice > 180 ? 1 : 0} 1 ${x2},${y2} Z`}
                  fill={COLORS[i % COLORS.length]}
                  opacity={live.has(i) ? 1 : 0.35}
                  stroke="white"
                  strokeWidth={2}
                />
              );
            })}
          {options.map((o, i) => {
            const mid = i * slice + slice / 2;
            const [x, y] = point(mid, R * 0.6);
            const text = o.label.length > 14 ? `${o.label.slice(0, 13)}…` : o.label;
            return (
              <text
                key={i}
                x={x}
                y={y}
                transform={`rotate(${mid - 90} ${x} ${y})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={n > 8 ? 11 : 14}
                fontWeight={700}
              >
                {text}
              </text>
            );
          })}
          <circle cx={R} cy={R} r={18} fill="white" />
        </svg>
      </div>

      <AnimatePresence mode="wait">
        {winner !== null && options[winner] ? (
          <motion.div key="win" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="glass rounded-3xl p-4 text-center">
            <p className="text-2xl font-extrabold">{fill(t.wheel.winner, { label: options[winner].label })}</p>
            {options[winner].tag && <p className="mt-1 text-sm font-semibold text-muted">{options[winner].tag}</p>}
            <Button size="sm" variant="soft" className="mt-3" onClick={() => didIt(winner)}>
              {t.wheel.weDidIt}
            </Button>
          </motion.div>
        ) : (
          spec.last && !spinning && (
            <p key="last" className="text-center text-sm text-muted">
              {fill(t.wheel.lastTime, { label: spec.last })}
            </p>
          )
        )}
      </AnimatePresence>

      {options.length < 2 && <p className="text-center text-sm font-semibold text-warn">{t.wheel.needTwo}</p>}
      <div className="flex gap-2">
        <Button size="lg" className="flex-1" onClick={spin} disabled={spinning || options.length < 2}>
          🎡 {spinning ? t.wheel.spinning : t.wheel.spin}
        </Button>
        <Button size="lg" variant="soft" onClick={onEdit} aria-label={t.wheel.edit}>
          <Pencil className="size-5" />
        </Button>
      </div>

      {options.some((o, i) => !live.has(i)) && (
        <p className="text-center text-xs text-faint">
          {options
            .filter((_, i) => !live.has(i))
            .map((o) => o.label)
            .join(", ")}{" "}
          · {fill(t.wheel.resting, { days: REST_DAYS })}
        </p>
      )}
    </div>
  );
}

function WheelEditor({ item, onSave, onDelete }: { item: Item; onSave: (patch: Partial<Item>) => void; onDelete: () => void }) {
  const { t } = useI18n();
  const spec = readWheel(item.props);
  const [title, setTitle] = useState(item.title);
  const [options, setOptions] = useState<WheelOption[]>(spec.options.length ? spec.options : [{ label: "" }, { label: "" }]);
  const [confirm, setConfirm] = useState(false);
  const set = (i: number, patch: Partial<WheelOption>) => setOptions((p) => p.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <div className="glass space-y-3 rounded-3xl p-4">
      <label className="block">
        <span className="mb-1 block px-1 text-sm font-semibold text-muted">{t.wheel.rename}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="font-bold" />
      </label>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <Input value={o.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={`${t.wheel.option} ${i + 1}`} className="min-w-0 flex-[3]" />
            <Input value={o.tag ?? ""} onChange={(e) => set(i, { tag: e.target.value || undefined })} placeholder={t.wheel.tag} className="min-w-0 flex-[2] text-sm" />
            <button type="button" onClick={() => setOptions((p) => p.filter((_, j) => j !== i))} aria-label={t.common.delete} className="shrink-0 text-faint">
              <X className="size-5" />
            </button>
          </div>
        ))}
      </div>
      <Button variant="soft" size="sm" onClick={() => setOptions((p) => [...p, { label: "" }])}>
        <Plus className="size-4" /> {t.wheel.addOption}
      </Button>
      <div className="flex gap-2 pt-2">
        <Button
          size="lg"
          className="flex-1"
          onClick={() =>
            onSave({ title: title.trim() || item.title, props: wheelProps(item.props, { ...spec, options: options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label) }) })
          }
        >
          {t.wheel.done}
        </Button>
        <Button size="lg" variant="danger" className={cn(confirm && "px-4")} onClick={() => (confirm ? onDelete() : setConfirm(true))} aria-label={t.wheel.delete}>
          <Trash2 className="size-5" /> {confirm ? t.wheel.delete : ""}
        </Button>
      </div>
    </div>
  );
}
