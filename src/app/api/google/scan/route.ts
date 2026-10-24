import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { scanGmail } from "@/lib/subs/scan";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** "Scan now" in a Subscriptions space. */
export async function POST(request: Request) {
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { sectionId } = (await request.json().catch(() => ({}))) as { sectionId?: string };
  // RLS: only a space this user can see.
  const { data: section } = sectionId ? await supabase.from("sections").select("id").eq("id", sectionId).maybeSingle() : { data: null };
  if (!section) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json(await scanGmail(createSupabaseAdmin(), section.id));
}
