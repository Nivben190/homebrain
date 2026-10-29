import { NextResponse } from "next/server";
import { presentedToken } from "@/lib/hook-keys";
import { authenticateHook } from "@/lib/hook-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { routeCapture } from "@/lib/capture";
import { newCommit } from "@/lib/commit";

export const dynamic = "force-dynamic";

/**
 * Siri / Shortcuts capture: "Hey Siri, Brain add milk".
 *   POST /api/hooks/capture?text=milk[&space=<id or name>]
 * Text and space may also come as JSON: { "text": "...", "space": "..." }.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = presentedToken(request);
  let text = url.searchParams.get("text");
  let space = url.searchParams.get("space");
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      text ??= typeof body.text === "string" ? body.text : null;
      space ??= typeof body.space === "string" ? body.space : null;
    }
  } catch {
    // Query params are enough.
  }
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
  text = text?.trim().slice(0, 300) ?? "";
  if (!text) return NextResponse.json({ error: "nothing to add" }, { status: 400 });

  const db = createSupabaseAdmin();
  const userId = await authenticateHook(db, token, "capture");
  const { data: me } = userId ? await db.from("profiles").select("user_id,household_id,timezone").eq("user_id", userId).maybeSingle() : { data: null };
  if (!me?.household_id) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  // Shared spaces and this person's private ones.
  const { data: spaces } = await db
    .from("sections")
    .select("id,title,template,view")
    .eq("household_id", me.household_id)
    .or(`owner_id.is.null,owner_id.eq.${me.user_id}`)
    .order("position");
  const { space: target, text: title } = routeCapture(text, spaces ?? [], space);
  if (!target) return NextResponse.json({ error: "no list to add to" }, { status: 404 });

  // A commitment gets its period, any limit, and its end-of-period check.
  const extra = target.view === "commit" ? newCommit(title, new Date(), me.timezone) : { title };
  const { error } = await db.from("items").insert({ section_id: target.id, created_by: me.user_id, position: Date.now() / 1000, ...extra });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Shortcuts can speak this back.
  return NextResponse.json({ ok: true, space: target.title, said: `${extra.title} → ${target.title}` });
}
