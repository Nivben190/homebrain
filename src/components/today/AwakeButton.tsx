"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { emitEvent } from "@/app/actions";
import { useI18n } from "@/i18n/client";

/** Big sunrise button; also auto-fires once if the user's wake mode is "first open". */
export function AwakeButton({ firstOpen }: { firstOpen: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const auto = useRef(false);

  const wake = (source: "button" | "first_open") =>
    start(async () => {
      const res = await emitEvent("wake", source);
      if (source === "button" || res.fired || res.queued) setDone(true);
      router.refresh();
    });

  useEffect(() => {
    if (firstOpen && !auto.current) {
      auto.current = true;
      wake("first_open");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstOpen]);

  return (
    <AnimatePresence mode="wait">
      {done ? (
        <motion.div key="done" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-4 rounded-3xl bg-warn/15 p-4 text-center font-bold text-[#b86e00] dark:text-warn">
          {t.today.awakeDone}
        </motion.div>
      ) : (
        <motion.button
          key="btn"
          exit={{ scale: 0.9, opacity: 0 }}
          whileTap={{ scale: 0.97 }}
          disabled={pending}
          onClick={() => wake("button")}
          className="relative mt-4 flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-linear-to-br from-[#ff9f1c] via-[#ff7a59] to-[#ff5f9e] p-4 text-start text-white shadow-[0_16px_32px_-12px_#ff7a59]"
        >
          <motion.span
            className="flex size-14 items-center justify-center rounded-2xl bg-white/20 text-3xl"
            animate={{ rotate: [0, 12, -8, 0], y: [0, -3, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          >
            ☀️
          </motion.span>
          <span>
            <span className="block text-xl font-extrabold">{t.today.awake}</span>
            <span className="block text-sm text-white/85">{t.today.awakeHint}</span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
