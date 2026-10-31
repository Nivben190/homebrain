import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { scanDueGmail } from "@/lib/subs/scan";
import { isCronRequest } from "@/lib/cron";
import { ownerChecks } from "@/lib/owner-alerts";

export const dynamic = "force-dynamic";
// Reading a year of receipts can take minutes; this runs apart from the minute tick.
export const maxDuration = 300;

/**
 * Called every 30 minutes by pg_cron (supabase/migrations/0017_gmail_cron.sql): the
 * owner checks (a silent engine, the Sunday report), then one due inbox.
 */
export async function POST(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdmin();
  const owner = await ownerChecks(db).catch((e) => (console.error("[owner] checks failed", e), null));
  const result = await scanDueGmail(db);
  return NextResponse.json({ ok: true, result, owner });
}
