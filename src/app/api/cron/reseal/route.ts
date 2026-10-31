import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { isCronRequest } from "@/lib/cron";
import { resealAll } from "@/lib/reseal";

export const dynamic = "force-dynamic";

/** Step 3 of rotating GOOGLE_TOKEN_KEY (docs/SECRETS.md); called by hand with the cron secret. */
export async function POST(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.GOOGLE_TOKEN_KEY) return NextResponse.json({ error: "GOOGLE_TOKEN_KEY not set" }, { status: 500 });
  return NextResponse.json({ ok: true, result: await resealAll(createSupabaseAdmin()) });
}
