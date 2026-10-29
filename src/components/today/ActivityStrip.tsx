"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Sheet } from "@/components/ui";

export interface ActivityRow {
  id: number;
  actor: string | null;
  kind: string;
  title: string | null;
  at: string;
}

const AWAY_MINUTES = 60;

/** "Naomi ticked Milk · 2 min ago", live (roadmap 2.9). Tap for the day's history. */
export function ActivityStrip({ initial, userId, members }: { initial: ActivityRow[]; userId: string; members: { id: string; name: string; emoji: string }[] }) {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb
      .channel("activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity" }, (p: { new: unknown }) => setRows((r) => [p.new as ActivityRow, ...r].slice(0, 50)))
      .subscribe();
    const timer = setInterval(() => tick((n) => n + 1), 60_000);
    return () => {
      sb.removeChannel(channel);
      clearInterval(timer);
    };
  }, []);

  const who = (id: string | null) => members.find((m) => m.id === id);
  const ago = (iso: string) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
    return min < 60 ? rtf.format(-min, "minute") : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  };
  const line = (r: ActivityRow) => {
    const m = who(r.actor);
    const name = m ? `${m.emoji} ${m.name}` : "";
    return fill(t.activity[r.kind as keyof typeof t.activity] ?? r.kind, { name, title: r.title ?? "" });
  };

  const others = rows.filter((r) => r.actor !== userId);
  const store = others.find((r) => r.kind === "arrive_store" && Date.now() - new Date(r.at).getTime() < AWAY_MINUTES * 60000);
  const recent = others.filter((r) => r.kind !== "arrive_store").slice(0, 3);
  if (!store && recent.length === 0) return null;

  const today = new Date().toDateString();
  return (
    <>
      <button onClick={() => setOpen(true)} className="glass mb-3 w-full space-y-1.5 rounded-3xl p-4 text-start">
        {store && <p className="font-semibold">🛒 {fill(t.activity.atStore, { name: `${who(store.actor)?.emoji ?? ""} ${who(store.actor)?.name ?? ""}` })}</p>}
        {recent.map((r) => (
          <p key={r.id} className="flex gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{line(r)}</span>
            <span className="shrink-0 text-muted">{ago(r.at)}</span>
          </p>
        ))}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t.activity.today}>
        <div className="divide-y divide-card-border pb-4">
          {rows
            .filter((r) => new Date(r.at).toDateString() === today)
            .map((r) => (
              <p key={r.id} className="flex gap-2 py-2.5 text-sm">
                <span className="min-w-0 flex-1">{line(r)}</span>
                <span className="shrink-0 text-muted">{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(r.at))}</span>
              </p>
            ))}
        </div>
      </Sheet>
    </>
  );
}
