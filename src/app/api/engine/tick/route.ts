import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { tick } from "@/lib/engine/execute";
import { isCronRequest } from "@/lib/cron";
import { alertAfterTick, engineStateBefore } from "@/lib/owner-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called every minute by Supabase pg_cron (see supabase/migrations/0003_cron.sql). */
export async function POST(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdmin();
  const prev = await engineStateBefore(db);
  // Always 200: a failed phase is reported in `phases` and the next minute tries again.
  const { outcomes, phases } = await tick(db);
  const failed = phases.filter((p) => !p.ok);
  // The heartbeat /api/health watches (roadmap 1.5).
  const { error } = await db.from("engine_status").upsert({
    id: true,
    last_tick_at: new Date().toISOString(),
    failed_phases: failed.map((p) => p.phase),
    last_error: failed[0]?.error?.slice(0, 500) ?? null,
  });
  if (error) console.error("[engine] heartbeat not written", error.message);
  // The owner hears about failed phases, or a silence the engine just came back from.
  await alertAfterTick(db, prev, failed, new Date()).catch((e) => console.error("[engine] owner alert failed", e));
  return NextResponse.json({ ok: failed.length === 0, phases, outcomes });
}
