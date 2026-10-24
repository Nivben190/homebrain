"use client";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";

const WIDTH = 84;

/**
 * iOS-style swipe to delete: swipe toward the start edge to reveal a red
 * delete button. Vertical scrolling is untouched (direction lock + pan-y).
 */
export function SwipeRow({ children, onDelete, className }: { children: React.ReactNode; onDelete: () => void; className?: string }) {
  const { t, locale } = useI18n();
  const rtl = locale === "he";
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const dragged = useRef(false);
  const shift = rtl ? WIDTH : -WIDTH;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {revealed && (
        <button onClick={onDelete} aria-label={t.common.delete} className="absolute inset-y-0 end-0 flex items-center justify-center bg-danger text-white" style={{ width: WIDTH }}>
          <Trash2 className="size-6" />
        </button>
      )}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={rtl ? { left: 0, right: WIDTH } : { left: -WIDTH, right: 0 }}
        dragElastic={0.08}
        animate={{ x: open ? shift : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 40 }}
        onDragStart={() => {
          dragged.current = true;
          setRevealed(true);
        }}
        onDragEnd={(_, info) => {
          // Swallow the click that may follow this drag, then accept taps again.
          setTimeout(() => (dragged.current = false), 60);
          const toward = (rtl ? 1 : -1) * info.offset.x;
          setOpen(toward > WIDTH / 2 || (rtl ? info.velocity.x > 400 : info.velocity.x < -400));
        }}
        onAnimationComplete={() => !open && setRevealed(false)}
        // A tap on an open row closes it instead of opening the item.
        onClickCapture={(e) => {
          if (open || dragged.current) {
            e.stopPropagation();
            e.preventDefault();
            if (!dragged.current) setOpen(false);
          }
          dragged.current = false;
        }}
        className="relative touch-pan-y rounded-[inherit] bg-card-solid"
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Red ⊖ shown next to items in Edit mode. */
export function RemoveBadge({ onClick, className }: { onClick: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      whileTap={{ scale: 0.8 }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={t.common.delete}
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-full bg-danger text-white shadow", className)}
    >
      <span className="h-0.5 w-3.5 rounded-full bg-white" />
    </motion.button>
  );
}
