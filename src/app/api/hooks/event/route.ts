import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { handleEvent } from "@/lib/engine/execute";
import { EVENT_TYPES } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

/**
 * Webhook for iOS Shortcuts automations, e.g. "When alarm is stopped".
 *   POST /api/hooks/event?token=<hook_token>&type=wake
 * Type may also come from a JSON body: { "type": "wake" }.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-brain-token");
  let type = url.searchParams.get("type");
  let payload: Record<string, unknown> = {};
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      payload = body;
      type ??= typeof body.type === "string" ? body.type : null;
    }
  } catch {
    // Shortcuts may send an empty body; query params are enough.
  }
  type ??= "wake";
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
  if (!(EVENT_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: "unknown event type" }, { status: 400 });

  const db = createSupabaseAdmin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("hook_token", token).maybeSingle();
  if (!profile) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const outcomes = await handleEvent(db, profile.user_id, type, { ...payload, source: "shortcut" });
  return NextResponse.json({ ok: true, fired: outcomes.filter((o) => o.status === "fired").length, outcomes });
}
