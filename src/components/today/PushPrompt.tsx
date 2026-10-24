"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Share } from "lucide-react";
import { enablePush, getPushState, type PushState } from "@/lib/push-client";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui";

export function PushPrompt() {
  const { t } = useI18n();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState);
  }, []);

  const show = state === "default" || state === "needs-install";
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          className="mt-4 overflow-hidden rounded-3xl bg-linear-to-br from-[#7457ff] to-[#b65cff] p-4 text-white shadow-[0_16px_32px_-12px_#7457ff]"
        >
          {state === "needs-install" ? (
            <div className="flex items-center gap-3">
              <Share className="size-6 shrink-0" />
              <p className="text-[15px] font-medium">{t.today.installHint}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <BellRing className="size-7 shrink-0" />
              <div className="flex-1">
                <p className="font-bold">{t.today.enablePush}</p>
                <p className="text-sm text-white/80">{t.today.enablePushHint}</p>
              </div>
              <Button
                size="sm"
                className="bg-white text-[#7457ff] shadow-none"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  setState(await enablePush());
                  setBusy(false);
                }}
              >
                {t.settings.enable}
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
