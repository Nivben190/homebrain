import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { Card } from "@/components/ui";
import { RunActions } from "@/components/today/RunCard";
import type { Run } from "@/lib/db-types";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireHome();
  const t = await getT();
  const { data: run } = await supabase.from("runs").select("*").eq("id", id).maybeSingle<Run>();
  // Opening the notification counts as seeing it.
  if (run && !run.acknowledged_at && !run.rendered.some((r) => r.kind === "done")) {
    await supabase.from("runs").update({ acknowledged_at: new Date().toISOString() }).eq("id", id);
  }

  return (
    <div className="safe-top">
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4 rtl:rotate-180" /> {t.nav.today}
      </Link>
      {!run ? (
        <Card className="py-10 text-center text-muted">{t.run.notFound}</Card>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-5 flex size-24 items-center justify-center rounded-[2rem] bg-linear-to-br from-[#7457ff] to-[#ff6fa8] text-5xl shadow-[0_20px_40px_-12px_#7457ff]">
            {run.icon}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{run.title}</h1>
          {run.body && <p className="mt-2 text-lg text-muted">{run.body}</p>}
          <p className="mt-2 text-xs font-semibold text-faint">
            {t.run.firedAt}{" "}
            {new Intl.DateTimeFormat(profile.locale, { timeZone: profile.timezone, hour: "2-digit", minute: "2-digit", weekday: "short" }).format(new Date(run.fired_at))}
          </p>
          <Card className="mt-6 text-start">
            <RunActions run={run} />
          </Card>
        </div>
      )}
    </div>
  );
}
