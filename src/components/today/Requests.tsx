"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { MessageCircleHeart, X } from "lucide-react";
import { deleteRequest, sendRequest, setRequestStatus } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Button, Chip, Sheet, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { RequestRow } from "@/lib/db-types";
import type { Member } from "@/components/sections/PropertyInput";

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

/** "Ask Naomi" sheet: a quick request that lands on her Today screen with a push. */
export function AskSheet({ open, onClose, partner }: { open: boolean; onClose: () => void; partner: Member }) {
  const { t } = useI18n();
  const router = useRouter();
  const [text, setText] = useState("");
  const [due, setDue] = useState<"today" | "tomorrow" | null>("today");
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);

  function send() {
    if (!text.trim()) return;
    start(async () => {
      const res = await sendRequest({ to: partner.id, text, due });
      if (!res.ok) return;
      setSent(true);
      setText("");
      router.refresh();
      setTimeout(() => {
        setSent(false);
        onClose();
      }, 1100);
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${partner.emoji} ${fill(t.ask.title, { name: partner.name })}`}>
      <div className="space-y-4 pb-4">
        <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t.ask.placeholder} rows={3} maxLength={300} />
        <div className="flex gap-2">
          {(["today", "tomorrow", null] as const).map((d) => (
            <Chip key={String(d)} active={due === d} onClick={() => setDue(d)}>
              {d === "today" ? t.ask.today : d === "tomorrow" ? t.ask.tomorrow : t.ask.whenever}
            </Chip>
          ))}
        </div>
        <Button size="lg" className="w-full" loading={pending} disabled={!text.trim() || sent} onClick={send}>
          {sent ? fill(t.ask.sent, { name: partner.name }) : `💌 ${t.ask.send}`}
        </Button>
      </div>
    </Sheet>
  );
}

/** Requests sent to me (with actions) and the ones I'm waiting on. */
export function RequestCards({ incoming, outgoing, members }: { incoming: RequestRow[]; outgoing: RequestRow[]; members: Member[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [, start] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const who = (id: string) => members.find((m) => m.id === id);
  const act = (r: RequestRow, status: "doing" | "done" | "declined") => {
    if (status !== "doing") setHidden((h) => new Set(h).add(r.id));
    start(async () => {
      await setRequestStatus(r.id, status);
      router.refresh();
    });
  };
  const open = incoming.filter((r) => (r.status === "open" || r.status === "doing") && !hidden.has(r.id));
  const waiting = outgoing.filter((r) => (r.status === "open" || r.status === "doing") && !hidden.has(r.id));
  if (!open.length && !waiting.length) return null;

  return (
    <div className="mt-4 space-y-2">
      <AnimatePresence initial={false}>
        {open.map((r) => {
          const from = who(r.from_user);
          return (
            <motion.div key={r.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, height: 0 }} className="overflow-hidden rounded-3xl bg-linear-to-br from-[#ff5f9e]/15 to-[#7457ff]/15 p-4">
              <p className="text-xs font-bold text-muted">
                {from?.emoji} {fill(t.ask.from, { name: from?.name ?? "" })}
                {r.due_day ? ` · ${r.due_day.slice(5).split("-").reverse().join("/")}` : ""}
              </p>
              <p className="mt-1 text-[17px] font-bold leading-snug">{r.text}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="bg-success text-white shadow-none" onClick={() => act(r, "done")}>
                  {t.ask.done}
                </Button>
                {r.status === "open" && (
                  <Button size="sm" variant="soft" onClick={() => act(r, "doing")}>
                    {t.ask.onIt}
                  </Button>
                )}
                {r.status === "doing" && <span className="self-center text-sm font-semibold text-accent">{t.ask.onIt}</span>}
                <Button size="sm" variant="ghost" className="ms-auto" onClick={() => act(r, "declined")}>
                  {t.ask.cant}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {waiting.map((r) => {
        const to = who(r.to_user);
        return (
          <div key={r.id} className={cn("flex items-center gap-2 rounded-2xl bg-sunken px-3 py-2 text-sm")}>
            <MessageCircleHeart className="size-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-muted">{fill(t.ask.waiting, { name: to?.name ?? "" })}: </span>
              <span className="font-semibold">{r.text}</span>
              {r.status === "doing" && <span className="text-accent"> · {t.ask.onIt}</span>}
            </span>
            <button
              aria-label={t.common.delete}
              onClick={() => {
                setHidden((h) => new Set(h).add(r.id));
                start(() => deleteRequest(r.id));
              }}
              className="text-faint"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
