"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { dismissRun, markRun } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import type { Run } from "@/lib/db-types";
import type { RenderedAction } from "@/lib/engine/types";

export function RunActions({ run, onDone }: { run: Run; onDone?: () => void }) {
  const { t } = useI18n();
  const [done, setDone] = useState(!!run.done_at);
  const [, start] = useTransition();
  const links = run.rendered.filter((r): r is Extract<RenderedAction, { kind: "link" }> => r.kind === "link");
  const notes = run.rendered.filter((r): r is Extract<RenderedAction, { kind: "note" }> => r.kind === "note");
  const doneBtn = run.rendered.find((r): r is Extract<RenderedAction, { kind: "done" }> => r.kind === "done");

  return (
    <div className="space-y-2.5">
      {notes.map((n, i) => (
        <p key={i} className="rounded-2xl bg-sunken px-3.5 py-2.5 text-[15px] leading-snug">
          <span className="me-1.5">{n.icon}</span>
          {n.text}
        </p>
      ))}
      {(links.length > 0 || doneBtn) && (
        <div className="flex flex-wrap gap-2">
          {links.map((l, i) =>
            l.external ? (
              <a key={i} href={l.href} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-accent px-4 font-semibold text-accent-fg transition active:scale-95">
                <span>{l.icon}</span> {l.label}
              </a>
            ) : (
              <Link key={i} href={l.href} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-accent-soft px-4 font-semibold text-accent transition active:scale-95">
                <span>{l.icon}</span> {l.label}
              </Link>
            ),
          )}
          {doneBtn && (
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                const next = !done;
                setDone(next);
                start(async () => {
                  await markRun(run.id, next);
                  if (next) onDone?.();
                });
              }}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-2xl px-4 font-semibold transition",
                done ? "bg-success text-white" : "bg-success/12 text-success",
              )}
            >
              <motion.span animate={done ? { scale: [1, 1.4, 1], rotate: [0, -15, 0] } : {}}>
                <Check className="size-5" strokeWidth={3} />
              </motion.span>
              {done ? t.run.completed : doneBtn.label}
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}

export function RunCard({ run }: { run: Run }) {
  const [gone, setGone] = useState(false);
  const [, start] = useTransition();
  if (gone) return null;
  return (
    <motion.div layout className="glass relative rounded-3xl p-4">
      <button
        aria-label="Dismiss"
        onClick={() => {
          setGone(true);
          start(() => dismissRun(run.id));
        }}
        className="absolute end-3 top-3 flex size-8 items-center justify-center rounded-full text-faint transition hover:bg-sunken"
      >
        <X className="size-4" />
      </button>
      <Link href={`/runs/${run.id}`} className="flex items-start gap-3 pe-8">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-2xl">{run.icon}</span>
        <span className="min-w-0">
          <span className="block text-[17px] font-bold leading-snug">{run.title}</span>
          {run.body && <span className="block text-[15px] text-muted">{run.body}</span>}
        </span>
      </Link>
      {run.rendered.length > 0 && (
        <div className="mt-3">
          <RunActions run={run} onDone={() => setTimeout(() => setGone(true), 900)} />
        </div>
      )}
    </motion.div>
  );
}
