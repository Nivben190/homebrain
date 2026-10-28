import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { tick } from "@/lib/engine/execute";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called every minute by Supabase pg_cron (see supabase/migrations/0003_cron.sql). */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createSupabaseAdmin();
  // Always 200: a failed phase is reported in `phases` and the next minute tries again.
  const { outcomes, phases } = await tick(db);
  return NextResponse.json({ ok: phases.every((p) => p.ok), phases, outcomes });
}
