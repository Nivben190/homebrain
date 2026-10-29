"use client";
import { Activity } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface BrainStatus {
  ok: boolean;
  ageSeconds: number | null;
  failedPhases: string[];
  failedJobs: number;
  expiredGoogle: number;
}

/** Roadmap 1.5: is the engine ticking, and did anything fail this week? */
export function BrainStatusCard({ status }: { status: BrainStatus }) {
  const { t } = useI18n();
  const s = t.settings;
  const ago = (sec: number) => (sec < 90 ? s.justNow : sec < 5400 ? fill(s.minutesAgo, { n: Math.round(sec / 60) }) : fill(s.hoursAgo, { n: Math.round(sec / 3600) }));
  const headline = status.ageSeconds === null ? s.brainNever : fill(status.ok ? s.brainRunning : s.brainStopped, { ago: ago(status.ageSeconds) });
  return (
    <Card className="space-y-1.5">
      <div className="flex items-center gap-3">
        <Activity className={cn("size-6 shrink-0", status.ok ? "text-accent" : "text-danger")} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{s.brainStatus}</p>
          <p role="status" className={cn("text-sm", status.ok ? "text-muted" : "font-semibold text-danger")}>
            <span aria-hidden className={cn("me-1.5 inline-block size-2 rounded-full", status.ok ? "bg-success" : "bg-danger")} />
            {headline}
          </p>
        </div>
      </div>
      {status.failedPhases.length > 0 && <p className="ps-9 text-sm text-warn">{fill(s.phaseFailing, { phases: status.failedPhases.join(", ") })}</p>}
      <p className={cn("ps-9 text-sm", status.failedJobs ? "text-warn" : "text-muted")}>{status.failedJobs ? fill(s.failedJobs, { n: status.failedJobs }) : s.noFailures}</p>
      {status.expiredGoogle > 0 && <p className="ps-9 text-sm text-warn">{fill(s.googleExpired, { n: status.expiredGoogle })}</p>}
    </Card>
  );
}
