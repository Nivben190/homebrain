"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Lock } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { moveItem } from "@/lib/reorder";
import { reorderSections } from "@/app/actions";
import { IconTile } from "@/components/ui";
import type { Section } from "@/lib/db-types";

const HOLD_MS = 400;

/**
 * The spaces as tiles. Hold one, then drag it over another tile to move it
 * there; letting go saves the order for both phones.
 */
export function SpacesGrid({ sections, counts }: { sections: Section[]; counts: Record<string, number> }) {
  const { t } = useI18n();
  const [order, setOrder] = useState(sections);
  const [dragging, setDragging] = useState<string | null>(null);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; id: string } | null>(null);
  const moved = useRef(false);

  // Live updates from the other phone (unless we're mid-drag).
  useEffect(() => {
    if (!dragging) setOrder(sections);
  }, [sections]); // eslint-disable-line react-hooks/exhaustive-deps

  function start(id: string) {
    moved.current = false;
    hold.current = {
      id,
      timer: setTimeout(() => {
        setDragging(id);
        navigator.vibrate?.(10);
      }, HOLD_MS),
    };
  }

  function cancelHold() {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  }

  function move(e: React.PointerEvent) {
    if (!dragging) return cancelHold();
    e.preventDefault();
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-space]")?.dataset.space;
    if (!over || over === dragging) return;
    moved.current = true;
    setOrder((list) => moveItem(list, list.findIndex((s) => s.id === dragging), list.findIndex((s) => s.id === over)));
  }

  async function end() {
    cancelHold();
    if (!dragging) return;
    setDragging(null);
    if (moved.current) await reorderSections(order.map((s) => s.id));
  }

  return (
    <>
      <div className={cn("grid grid-cols-2 gap-3", dragging && "touch-none select-none")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        {order.map((s) => (
          <motion.div key={s.id} layout data-space={s.id} animate={{ scale: dragging === s.id ? 1.06 : 1 }} className={cn(dragging === s.id && "z-10 opacity-90")}>
            <Link
              href={`/sections/${s.id}`}
              draggable={false}
              onPointerDown={() => start(s.id)}
              onContextMenu={(e) => e.preventDefault()}
              onClick={(e) => {
                // A drag (or a hold) isn't a tap.
                if (dragging || moved.current) e.preventDefault();
              }}
              className="glass group relative flex aspect-[1.1] flex-col justify-between rounded-[1.75rem] p-4 transition [-webkit-touch-callout:none] active:scale-[0.97]"
            >
              <div className="flex items-start justify-between">
                <IconTile icon={s.icon} color={s.color} className="size-12 text-2xl" />
                {s.owner_id && <Lock className="size-4 text-faint" />}
              </div>
              <div>
                <p className="line-clamp-2 text-[17px] font-bold leading-tight">{s.title}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {counts[s.id] ?? 0} {t.sections.items}
                </p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
      {order.length > 1 && <p className="mt-4 text-center text-xs text-faint">{t.sections.reorderHint}</p>}
    </>
  );
}
