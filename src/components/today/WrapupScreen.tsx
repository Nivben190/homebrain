"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlarmClock, ChevronLeft } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { moveItemToTomorrow, setRequestStatus } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { useToast } from "@/components/Toaster";
import { errorKey } from "@/lib/errors";
import { Card, SectionTitle } from "@/components/ui";
import { Ring, useCelebrate } from "@/components/sections/TrackerView";
import { alarmShortcutUrl } from "@/lib/engine/render";
import { todayKey } from "@/lib/engine/habits";
import { fill } from "@/i18n";

interface Entry {
  id: string;
  title: string;
  icon?: string;
  done: boolean;
}
type Kind = "session" | "due" | "request";

/** Alarm 45 minutes before tomorrow's first thing, never before 05:00. */
function suggestAlarm(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const mins = Math.max(5 * 60, h * 60 + m - 45);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function WrapupScreen({
  score,
  sessions,
  due,
  requests,
  tomorrowFirst,
  timeZone,
}: {
  score: { done: number; total: number; left: number };
  sessions: Entry[];
  due: Entry[];
  requests: Entry[];
  tomorrowFirst: { title: string; icon: string; time: string } | null;
  timeZone: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [, start] = useTransition();
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const { node, celebrate } = useCelebrate();
  const toast = useToast();

  const all = [...sessions.map((e) => ({ ...e, kind: "session" as Kind })), ...due.map((e) => ({ ...e, kind: "due" as Kind })), ...requests.map((e) => ({ ...e, kind: "request" as Kind }))];
  const open = all.filter((e) => !e.done && !handled.has(e.id));
  const done = all.filter((e) => e.done);
  const doneCount = score.done + [...handled].filter((id) => all.find((e) => e.id === id && !e.done)).length;
  const pct = score.total ? Math.round((Math.min(doneCount, score.total) / score.total) * 100) : 100;

  function act(e: (typeof all)[number], action: "done" | "skip" | "tomorrow") {
    setHandled((h) => new Set(h).add(e.id));
    if (action === "done") celebrate();
    start(async () => {
      let failure: unknown = null;
      try {
        const sb = supabaseBrowser();
        const day = todayKey(timeZone);
        if (e.kind === "session") ({ error: failure } = await sb.from("checkins").upsert({ item_id: e.id, day, status: action === "skip" ? "skipped" : "done" }, { onConflict: "item_id,day" }));
        else if (e.kind === "due" && action === "tomorrow") {
          const res = await moveItemToTomorrow(e.id);
          if (!res.ok) failure = res.error;
        } else if (e.kind === "due") {
          const { data, error } = await sb.from("items").update({ done: true }).eq("id", e.id).select("id");
          failure = error ?? (data?.length ? null : "permission denied");
        } else {
          const res = await setRequestStatus(e.id, "done");
          if (!res.ok) failure = res.error;
        }
      } catch (err) {
        failure = err;
      }
      // Not saved: it goes back on the list, and we say why.
      if (failure) {
        setHandled((h) => new Set([...h].filter((id) => id !== e.id)));
        toast.error(t.failures[errorKey(failure)]);
      }
      router.refresh();
    });
  }

  const alarmTime = tomorrowFirst ? suggestAlarm(tomorrowFirst.time) : null;

  return (
    <div className="safe-top">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4 rtl:rotate-180" /> {t.nav.today}
      </Link>
      <div className="flex items-center gap-4">
        <Ring value={pct} size={72} />
        <div>
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">{t.daily.wrapupTitle}</h1>
          <p className="text-muted">
            {score.total === 0 ? t.daily.wrapupEmpty : open.length === 0 ? t.daily.wrapupAllDone : fill(t.daily.wrapupBody, { done: doneCount, total: score.total, left: open.length })}
          </p>
        </div>
      </div>

      {open.length > 0 && (
        <>
          <SectionTitle>{t.daily.stillOpen}</SectionTitle>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {open.map((e) => (
                <motion.div key={e.id} layout exit={{ opacity: 0, x: -40, height: 0 }} className="glass rounded-3xl p-3.5">
                  <p className="font-bold">
                    {e.icon ? `${e.icon} ` : e.kind === "request" ? "💬 " : "📌 "}
                    {e.title}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => act(e, "done")} className="h-9 rounded-xl bg-success px-3 text-sm font-bold text-white transition active:scale-95">
                      ✓ {t.daily.done}
                    </button>
                    {e.kind === "session" && (
                      <button onClick={() => act(e, "skip")} className="h-9 rounded-xl bg-sunken px-3 text-sm font-semibold transition active:scale-95">
                        ⏭ {t.daily.skip}
                      </button>
                    )}
                    {e.kind === "due" && (
                      <button onClick={() => act(e, "tomorrow")} className="h-9 rounded-xl bg-accent-soft px-3 text-sm font-semibold text-accent transition active:scale-95">
                        {t.daily.moveTomorrow}
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <SectionTitle>{t.daily.doneToday}</SectionTitle>
          <Card className="divide-y divide-card-border p-0">
            {done.map((e) => (
              <p key={e.id} className="px-4 py-2.5 text-[15px] text-muted">
                <span className="text-success">✓</span> {e.icon} {e.title}
              </p>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>{t.daily.tomorrow}</SectionTitle>
      <Card>
        {tomorrowFirst && alarmTime ? (
          <div className="space-y-3">
            <p className="font-semibold">{fill(t.daily.suggestedAlarm, { first: `${tomorrowFirst.icon} ${tomorrowFirst.title}`, time: tomorrowFirst.time })}</p>
            <a href={alarmShortcutUrl(alarmTime, tomorrowFirst.title)} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-accent-fg">
              <AlarmClock className="size-5" /> {fill(t.daily.setAlarm, { time: alarmTime })}
            </a>
          </div>
        ) : (
          <p className="text-muted">{t.daily.noTomorrow}</p>
        )}
      </Card>
      {node}
    </div>
  );
}
