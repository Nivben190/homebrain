"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Flame, MessageCircle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { diffDays, habitStats, readHabit, todayKey, type HabitStats } from "@/lib/engine/habits";
import type { Dict } from "@/i18n";
import type { CheckinRow, Item } from "@/lib/db-types";
import type { Member } from "./PropertyInput";
import { fill } from "@/i18n";

export function describeNext(stats: HabitStats, today: string, t: Dict): string {
  if (!stats.nextDue) return "";
  const n = diffDays(today, stats.nextDue);
  if (n === 0) return t.tracker.today;
  if (n === 1) return t.tracker.tomorrow;
  return fill(t.tracker.inDays, { n: String(n) });
}

export function describeSchedule(item: Item, t: Dict): string {
  const habit = readHabit(item.props);
  if (!habit) return t.tracker.noSchedule;
  const r = habit.repeat;
  const when =
    r.kind === "weekly"
      ? r.days.length === 7
        ? t.tracker.daily
        : [...r.days].sort().map((d) => t.weekdaysShort[d]).join(" ")
      : r.kind === "monthly"
        ? `${r.every === 1 ? t.tracker.monthly : `${t.tracker.every} ${r.every} ${t.tracker.months}`} · ${r.day}`
        : r.every === 1
          ? t.tracker.daily
          : `${t.tracker.every} ${r.every} ${t.tracker.days}`;
  return `${when} · ${habit.time}`;
}

/** Small SVG ring for the 30-day completion rate. */
export function Ring({ value, size = 44 }: { value: number | null; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = value ?? 0;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90" aria-label={`${pct}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={6} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--success)"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: c - (c * pct) / 100 }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="rotate-90 fill-current text-[11px] font-bold" style={{ transformOrigin: "center" }}>
        {value === null ? "–" : `${pct}`}
      </text>
    </svg>
  );
}

/** Emoji burst + cheer, Duolingo style. */
export function Celebration({ show, text }: { show: boolean; text: string }) {
  const bits = ["🎉", "🔥", "⭐", "💪", "✨", "🐾"];
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute text-3xl"
              initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
              animate={{ x: Math.cos((i / 18) * Math.PI * 2) * (120 + (i % 3) * 40), y: Math.sin((i / 18) * Math.PI * 2) * (120 + (i % 3) * 40) - 40, scale: 1.2, opacity: 0 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            >
              {bits[i % bits.length]}
            </motion.span>
          ))}
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="rounded-3xl bg-fg px-6 py-4 text-2xl font-extrabold text-bg shadow-2xl">
            {text}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useCelebrate() {
  const { t } = useI18n();
  const [cheer, setCheer] = useState<string | null>(null);
  return {
    node: <Celebration show={!!cheer} text={cheer ?? ""} />,
    celebrate: () => {
      try {
        navigator.vibrate?.(30);
      } catch {
        // Not supported on iOS; the animation is enough.
      }
      setCheer(t.tracker.cheers[Math.floor(Math.random() * t.tracker.cheers.length)]);
      setTimeout(() => setCheer(null), 1300);
    },
  };
}

export function HabitCard({
  item,
  checkins,
  members,
  timeZone,
  onOpen,
  onCheckIn,
  onNote,
  assignees,
  warning,
}: {
  item: Item;
  checkins: CheckinRow[];
  members: Member[];
  timeZone: string;
  onOpen: () => void;
  onCheckIn: (status: "done" | null) => void;
  /** Once done today: add or edit an optional note. */
  onNote?: () => void;
  /** User ids on it today; shown as avatars when assigned. */
  assignees?: string[];
  warning?: string | null;
}) {
  const { t } = useI18n();
  const today = todayKey(timeZone);
  const habit = readHabit(item.props);
  const stats = habitStats(habit, checkins, today);
  const todays = checkins.find((c) => c.day === today);
  const by = todays?.user_id ? members.find((m) => m.id === todays.user_id) : null;
  const canCheck = stats.dueToday || !habit;

  return (
    <motion.div layout className="glass flex items-center gap-3 rounded-3xl p-3.5">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <Ring value={stats.rate} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[17px] font-bold leading-snug">{item.title}</span>
            {habit?.assign && assignees && assignees.length > 0 && (
              <span className="flex shrink-0 -space-x-1.5 rtl:space-x-reverse">
                {assignees.map((id) => {
                  const m = members.find((x) => x.id === id);
                  return m ? (
                    <span key={id} title={m.name} className="flex size-6 items-center justify-center rounded-full border-2 border-card-solid bg-accent-soft text-xs">
                      {m.emoji}
                    </span>
                  ) : null;
                })}
              </span>
            )}
          </span>
          <span className="block truncate text-sm text-muted">{describeSchedule(item, t)}</span>
          {warning && <span className="block truncate text-xs font-semibold text-[#e0601b]">{warning}</span>}
          <span className="mt-0.5 flex items-center gap-2 text-xs font-semibold">
            <span className={cn("inline-flex items-center gap-0.5", stats.streak > 0 ? "text-[#ff7a1a]" : "text-faint")}>
              <Flame className="size-3.5" fill={stats.streak > 0 ? "currentColor" : "none"} /> {stats.streak}
            </span>
            {todays ? (
              <span className="min-w-0 truncate text-success">
                ✓ {t.tracker.doneToday}
                {by ? ` · ${by.emoji}` : ""}
                {todays.note && <span className="font-normal text-muted"> · {todays.note}</span>}
              </span>
            ) : (
              habit && <span className="text-muted">{t.tracker.next}: {describeNext(stats, today, t)}</span>
            )}
          </span>
        </span>
      </button>
      {todays?.status === "done" && onNote && (
        <button
          onClick={onNote}
          aria-label={t.tracker.addNote}
          title={t.tracker.addNote}
          className={cn("flex size-10 shrink-0 items-center justify-center rounded-full transition active:scale-90", todays.note ? "bg-accent-soft text-accent" : "bg-sunken text-faint")}
        >
          <MessageCircle className="size-5" fill={todays.note ? "currentColor" : "none"} />
        </button>
      )}
      {canCheck && (
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => onCheckIn(todays ? null : "done")}
          aria-label={todays ? t.tracker.undo : t.tracker.checkIn}
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl border-2 transition-colors",
            todays ? "border-success bg-success text-white shadow-[0_8px_20px_-8px_var(--success)]" : "border-dashed border-faint text-faint",
          )}
        >
          {/* Pops only when toggled; the first render is already at rest. */}
          <motion.span initial={false} animate={todays ? { scale: [0.4, 1.25, 1], rotate: [-30, 0, 0] } : { scale: 1, rotate: 0 }} transition={{ duration: 0.4 }}>
            <Check className="size-7" strokeWidth={3.2} />
          </motion.span>
        </motion.button>
      )}
    </motion.div>
  );
}
