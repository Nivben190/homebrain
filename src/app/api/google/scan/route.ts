import { after, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { scanGmail } from "@/lib/subs/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A space this user can see (RLS), from its id. */
async function visibleSection(sectionId: string | null | undefined) {
  const { supabase, user } = await getSession();
  if (!user || !sectionId) return null;
  const { data } = await supabase.from("sections").select("id").eq("id", sectionId).maybeSingle();
  return data;
}

/**
 * "Scan now" in a Subscriptions space. Reading a year of receipts takes a minute
 * or two, so it runs after the response; the page polls GET for the result.
 */
export async function POST(request: Request) {
  const { sectionId } = (await request.json().catch(() => ({}))) as { sectionId?: string };
  const section = await visibleSection(sectionId);
  if (!section) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  after(() => scanGmail(createSupabaseAdmin(), section.id));
  return NextResponse.json({ ok: true, started: true });
}

/** Where the last scan got to: when it finished, and whether it failed. */
export async function GET(request: Request) {
  const section = await visibleSection(new URL(request.url).searchParams.get("sectionId"));
  if (!section) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { data } = await createSupabaseAdmin().from("gmail_connections").select("status,last_scan_at,scan_error").eq("section_id", section.id).maybeSingle();
  return NextResponse.json({ ok: true, status: data?.status ?? null, lastScanAt: data?.last_scan_at ?? null, failed: !!data?.scan_error });
}
