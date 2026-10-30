"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { HabitCard, useCelebrate } from "@/components/sections/TrackerView";
import { todayKey } from "@/lib/engine/habits";
import { useI18n } from "@/i18n/client";
import { useToast } from "@/components/Toaster";
import { errorKey } from "@/lib/errors";
import { idbQueue, isNetworkError, type QueuedWrite } from "@/lib/offline-queue";
import { cn } from "@/lib/cn";
import type { CheckinRow, Item } from "@/lib/db-types";
import type { Member } from "@/components/sections/PropertyInput";
import { fill } from "@/i18n";

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
  const toast = useToast();
  const today = todayKey(timeZone);

  useEffect(() => {
    const ids = new Set(items.map((i) => i.id));
    const sb = supabaseBrowser();
    const channel = sb
      .channel("today-checkins")
      .on("postgres_changes", { event: "*", schema: "public", table: "checkins" }, (p: { eventType: string; new: unknown; old: unknown }) => {
        const row = (p.eventType === "DELETE" ? p.old : p.new) as Partial<CheckinRow>;
        if (!row.item_id || !ids.has(row.item_id)) return;
        setCheckins((list) => {
          const rest = list.filter((c) => !(c.item_id === row.item_id && c.day === row.day));
          return p.eventType === "DELETE" ? rest : [...rest, p.new as CheckinRow];
        });
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [items]);

  const handled = (id: string) => checkins.some((c) => c.item_id === id && c.day === today);
  const todo = items.filter((i) => !handled(i.id) || settling.has(i.id));
  const done = items.filter((i) => handled(i.id) && !settling.has(i.id));

  /** Offline, the write waits in the queue (like the space screen); refused, it's undone and explained. */
  async function save(write: () => PromiseLike<{ error: unknown }>, queued: QueuedWrite, revert: () => void) {
    let error: unknown;
    try {
      ({ error } = await write());
    } catch (e) {
      error = e;
    }
    if (!error) return;
    if (isNetworkError(error)) {
      try {
        return await idbQueue.add(queued);
      } catch {
        // No IndexedDB: undo below.
      }
    }
    revert();
    toast.error(t.failures[errorKey(error)]);
  }

  async function checkIn(item: Item, status: "done" | null) {
    const sb = supabaseBrowser();
    const existing = checkins.find((c) => c.item_id === item.id && c.day === today);
    const mine = (c: CheckinRow) => c.item_id === item.id && c.day === today;
    const revert = () => setCheckins((p) => [...p.filter((c) => !mine(c)), ...(existing ? [existing] : [])]);
    if (status === null) {
      setCheckins((p) => p.filter((c) => c !== existing));
      const match = { item_id: item.id, day: today };
      await save(() => sb.from("checkins").delete().eq("item_id", item.id).eq("day", today), { table: "checkins", action: "delete", match }, revert);
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
    const values = { id: row.id, item_id: item.id, day: today, status };
    await save(() => sb.from("checkins").upsert(values, { onConflict: "item_id,day" }), { table: "checkins", action: "upsert", values, onConflict: "item_id,day" }, revert);
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
            ✓ {fill(t.tracker.doneTodayCount, { n: String(done.length) })}
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
