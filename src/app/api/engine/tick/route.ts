import { after, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { tick } from "@/lib/engine/execute";
import { scanDueGmail } from "@/lib/subs/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Called every minute by Supabase pg_cron (see supabase/migrations/0003_cron.sql). */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createSupabaseAdmin();
  const outcomes = await tick(db);
  // The daily Gmail check runs after the response, so reminders never wait on it.
  after(() => scanDueGmail(db).catch((e) => console.error("[gmail] daily scan", e)));
  return NextResponse.json({ ok: true, outcomes });
}
