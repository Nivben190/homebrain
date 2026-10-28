import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { scanDueGmail } from "@/lib/subs/scan";
import { isCronRequest } from "@/lib/cron";

export const dynamic = "force-dynamic";
// Reading a year of receipts can take minutes; this runs apart from the minute tick.
export const maxDuration = 300;

/** Called every 30 minutes by pg_cron (supabase/migrations/0017_gmail_cron.sql): scans one due inbox. */
export async function POST(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await scanDueGmail(createSupabaseAdmin());
  return NextResponse.json({ ok: true, result });
}
