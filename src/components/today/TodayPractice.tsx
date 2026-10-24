"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { HabitCard, useCelebrate } from "@/components/sections/TrackerView";
import { todayKey } from "@/lib/engine/habits";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import type { CheckinRow, Item } from "@/lib/db-types";
import type { Member } from "@/components/sections/PropertyInput";

/** How long a just-checked card stays in place (showing ✓) before moving to "done". */
const SETTLE_MS = 900;

/**
 * Tracker sessions due today. Only what's left to do is shown; finished ones
 * (done or skipped) fold into a "Done today" group you can open.
 */
export function TodayPractice({
  items,
  initialCheckins,
  members,
  userId,
  timeZone,
  meta = {},
}: {
  items: Item[];
  initialCheckins: CheckinRow[];
  members: Member[];
  userId: string;
  timeZone: string;
  meta?: Record<string, { assignees: string[]; warning: string | null }>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [checkins, setCheckins] = useState(initialCheckins);
  const [settling, setSettling] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const { node, celebrate } = useCelebrate();
  const today = todayKey(timeZone);

  const handled = (id: string) => checkins.some((c) => c.item_id === id && c.day === today);
  const todo = items.filter((i) => !handled(i.id) || settling.has(i.id));
  const done = items.filter((i) => handled(i.id) && !settling.has(i.id));

  async function checkIn(item: Item, status: "done" | null) {
    const sb = supabaseBrowser();
    const existing = checkins.find((c) => c.item_id === item.id && c.day === today);
    if (status === null) {
      setCheckins((p) => p.filter((c) => c !== existing));
      await sb.from("checkins").delete().eq("item_id", item.id).eq("day", today);
      return;
    }
    const row: CheckinRow = { id: crypto.randomUUID(), item_id: item.id, user_id: userId, day: today, status, note: null, created_at: new Date().toISOString() };
    setCheckins((p) => [...p.filter((c) => c !== existing), row]);
    // Let the ✓ land before the card slides into "Done today".
    setSettling((s) => new Set(s).add(item.id));
    setTimeout(() => setSettling((s) => {
      const next = new Set(s);
      next.delete(item.id);
      return next;
    }), SETTLE_MS);
    celebrate();
    await sb.from("checkins").upsert({ id: row.id, item_id: item.id, day: today, status }, { onConflict: "item_id,day" });
  }

  const card = (i: Item) => (
    <motion.div key={i.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40, height: 0, marginTop: 0 }} transition={{ duration: 0.3 }}>
      <HabitCard
        item={i}
        checkins={checkins.filter((c) => c.item_id === i.id)}
        members={members}
        timeZone={timeZone}
        onOpen={() => router.push(`/sections/${i.section_id}`)}
        onCheckIn={(status) => checkIn(i, status)}
        assignees={meta[i.id]?.assignees}
        warning={meta[i.id]?.warning}
      />
    </motion.div>
  );

  return (
    <div>
      <div className="space-y-3">
        <AnimatePresence initial={false}>{todo.map(card)}</AnimatePresence>
      </div>

      {todo.length === 0 && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl bg-success/12 p-4 text-center font-bold text-success">
          {t.tracker.allDone}
        </motion.div>
      )}

      {done.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowDone((v) => !v)} className="inline-flex items-center gap-1 px-1 text-sm font-semibold text-muted">
            ✓ {t.tracker.doneTodayCount.replace("{n}", String(done.length))}
            <ChevronDown className={cn("size-4 transition", showDone && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-3 pt-2 opacity-75">{done.map(card)}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      {node}
    </div>
  );
}
