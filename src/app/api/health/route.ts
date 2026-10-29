import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { tickHealth, type EngineStatus } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * For an uptime monitor: 200 while the engine ticks, 503 once the last tick is
 * more than 3 minutes old or the database can't be read. Says nothing private.
 */
export async function GET() {
  const { data, error } = await createSupabaseAdmin().from("engine_status").select("last_tick_at,failed_phases").maybeSingle<EngineStatus>();
  if (error) return NextResponse.json({ ok: false, error: "database" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const health = tickHealth(data);
  return NextResponse.json(health, { status: health.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
