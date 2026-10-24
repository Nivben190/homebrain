import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { addDays, habitStats, readHabit, todayKey, type Checkin } from "@/lib/engine/habits";
import type { Profile, Section } from "@/lib/db-types";

export const dynamic = "force-dynamic";

/**
 * One-tap check-in from an iPhone Shortcut (Home Screen, Action Button, Siri):
 *   POST /api/hooks/checkin?token=<hook_token>&item=<item id>
 * Replies with a short line the Shortcut can show, e.g. "✓ Breakfast · 🔥 5".
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-brain-token");
  const itemId = url.searchParams.get("item");
  if (!token || !itemId) return NextResponse.json({ error: "missing token or item" }, { status: 400 });

  const db = createSupabaseAdmin();
  const { data: me } = await db.from("profiles").select("*").eq("hook_token", token).maybeSingle<Profile>();
  if (!me?.household_id) return NextResponse.json({ error: "invalid token" }, { status: 401 });

  const { data: item } = await db.from("items").select("id,title,props,sections(*)").eq("id", itemId).maybeSingle();
  const section = item?.sections as unknown as Section | undefined;
  // Same visibility as the app: your household, and not someone else's private space.
  if (!item || !section || section.household_id !== me.household_id || (section.owner_id && section.owner_id !== me.user_id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const today = todayKey(me.timezone);
  const { error } = await db.from("checkins").upsert({ item_id: item.id, day: today, status: "done", user_id: me.user_id }, { onConflict: "item_id,day" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: rows } = await db.from("checkins").select("day,status").eq("item_id", item.id).gte("day", addDays(today, -400));
  const stats = habitStats(readHabit(item.props ?? {}), (rows ?? []) as Checkin[], today);
  const message = `✓ ${item.title}${stats.streak > 1 ? ` · 🔥 ${stats.streak}` : ""}`;
  return NextResponse.json({ ok: true, message, streak: stats.streak });
}
