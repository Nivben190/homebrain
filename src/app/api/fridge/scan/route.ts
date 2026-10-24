import { NextResponse } from "next/server";
import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";
import { seeFridge } from "@/lib/fridge-vision";
import { planScan, toBuy } from "@/lib/fridge";
import { fill, getDict, isLocale } from "@/i18n";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Scans a fridge photo into the Fridge space's inventory, and puts staples that
 * ran low or out on the shopping list.
 *   From the app:   POST multipart "image" (+ "space"), signed in.
 *   From a camera:  POST /api/fridge/scan?token=<hook_token>[&space=<id>], body = the JPEG.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-brain-token");
  const db = createSupabaseAdmin();

  let userId: string | null = null;
  if (token) {
    const { data } = await db.from("profiles").select("user_id").eq("hook_token", token).maybeSingle();
    userId = data?.user_id ?? null;
  } else {
    const { data } = await (await createSupabaseServer()).auth.getUser();
    userId = data.user?.id ?? null;
  }
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await db.from("profiles").select("user_id,household_id,locale").eq("user_id", userId).maybeSingle();
  if (!me?.household_id) return NextResponse.json({ error: "no home" }, { status: 401 });

  let image: Uint8Array;
  let mediaType = "image/jpeg";
  let spaceId = url.searchParams.get("space");
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "no image" }, { status: 400 });
    image = new Uint8Array(await file.arrayBuffer());
    mediaType = file.type || mediaType;
    spaceId ??= (form.get("space") as string | null) ?? null;
  } else {
    image = new Uint8Array(await request.arrayBuffer());
    mediaType = request.headers.get("content-type")?.split(";")[0] || mediaType;
  }
  if (!image.length) return NextResponse.json({ error: "no image" }, { status: 400 });
  if (image.length > MAX_BYTES) return NextResponse.json({ error: "image too large" }, { status: 413 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(mediaType)) return NextResponse.json({ error: "unsupported image" }, { status: 415 });

  let spaces = db.from("sections").select("id,icon").eq("household_id", me.household_id).eq("view", "fridge").or(`owner_id.is.null,owner_id.eq.${me.user_id}`);
  if (spaceId) spaces = spaces.eq("id", spaceId);
  const { data: space } = await spaces.order("position").limit(1).maybeSingle();
  if (!space) return NextResponse.json({ error: "no Fridge space" }, { status: 404 });

  const { data: rows } = await db.from("items").select("id,title,props").eq("section_id", space.id);
  const locale = isLocale(me.locale) ? me.locale : "he";
  let seen;
  try {
    seen = await seeFridge(image, mediaType, (rows ?? []).map((r) => r.title), locale);
  } catch (e) {
    console.error("[fridge]", e);
    return NextResponse.json({ error: "scan failed" }, { status: 502 });
  }

  const plan = planScan(rows ?? [], seen, new Date());
  await Promise.all(plan.update.map((u) => db.from("items").update({ props: u.props }).eq("id", u.id)));
  if (plan.insert.length) {
    const base = Date.now() / 1000;
    await db.from("items").insert(plan.insert.map((i, n) => ({ ...i, section_id: space.id, created_by: me.user_id, position: base + n })));
  }

  // Missing staples go on the shared shopping list.
  let added: string[] = [];
  if (plan.missing.length) {
    const { data: list } = await db.from("sections").select("id").eq("household_id", me.household_id).eq("template", "groceries").is("owner_id", null).order("position").limit(1).maybeSingle();
    if (list) {
      const { data: open } = await db.from("items").select("title").eq("section_id", list.id).eq("done", false);
      added = toBuy(plan.missing, (open ?? []).map((o) => o.title));
      if (added.length) {
        const base = Date.now() / 1000;
        await db.from("items").insert(added.map((title, n) => ({ section_id: list.id, title, created_by: me.user_id, position: base + n })));
      }
    }
  }
  await db.from("sections").update({ settings: { lastScan: new Date().toISOString() } }).eq("id", space.id);

  // A camera scan has nobody looking at the screen.
  if (token && added.length) {
    const t = getDict(locale);
    await sendPush(db, me.user_id, { title: `${space.icon} ${fill(t.fridge.pushTitle, { n: added.length })}`, body: added.join(", "), url: `/sections/${space.id}` });
  }
  return NextResponse.json({ ok: true, seen: seen.length, added: plan.insert.map((i) => i.title), missing: plan.missing, toBuy: added });
}
