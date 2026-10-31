"use client";
import { useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { sendFeedback } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Button, Sheet } from "@/components/ui";

/** Me → Send feedback: a few words straight to whoever runs the app. */
export function FeedbackRow() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<"sent" | "failed" | null>(null);
  const [pending, start] = useTransition();

  function send() {
    start(async () => {
      const res = await sendFeedback(text);
      setResult(res.ok ? "sent" : "failed");
      if (res.ok) setText("");
    });
  }

  return (
    <>
      <button type="button" onClick={() => (setResult(null), setOpen(true))} className="flex w-full items-center gap-3 px-4 py-3.5 text-start">
        <span className="text-2xl">💬</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t.feedback.title}</span>
          <span className="block truncate text-sm text-muted">{t.feedback.hint}</span>
        </span>
        <ChevronRight className="size-5 text-faint rtl:rotate-180" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.feedback.title}>
        <div className="space-y-3 pb-4">
          {result === "sent" ? (
            <p className="rounded-2xl bg-success/10 px-4 py-3 text-sm font-semibold text-success">{t.feedback.sent}</p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label={t.feedback.title}
                placeholder={t.feedback.placeholder}
                rows={5}
                maxLength={4000}
                className="w-full rounded-2xl bg-sunken p-3 text-[15px] outline-none focus:ring-2 focus:ring-accent"
              />
              {result === "failed" && <p className="text-sm text-danger">{t.feedback.failed}</p>}
              <Button className="w-full" loading={pending} disabled={text.trim().length < 3} onClick={send}>
                {t.feedback.send}
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
