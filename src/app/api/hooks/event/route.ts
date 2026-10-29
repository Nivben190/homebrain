import { NextResponse } from "next/server";
import { presentedToken } from "@/lib/hook-keys";
import { authenticateHook } from "@/lib/hook-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { handleEvent } from "@/lib/engine/execute";
import { EVENT_TYPES } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

/**
 * Webhook for iOS Shortcuts automations, e.g. "When alarm is stopped".
 *   POST /api/hooks/event?type=wake   header x-brain-token: <event key>
 * Type may also come from a JSON body: { "type": "wake" }.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = presentedToken(request);
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
  const userId = await authenticateHook(db, token, "event");
  if (!userId) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const outcomes = await handleEvent(db, userId, type, { ...payload, source: "shortcut" });
  return NextResponse.json({ ok: true, fired: outcomes.filter((o) => o.status === "fired").length, outcomes });
}
