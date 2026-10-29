import { NextResponse } from "next/server";
import { presentedToken } from "@/lib/hook-keys";
import { authenticateHook } from "@/lib/hook-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { mergeNote, noteLines, type NoteState } from "@/lib/notes-sync";
import type { Profile, Section } from "@/lib/db-types";

export const dynamic = "force-dynamic";

/**
 * Apple Notes sync from the "Brain Notes Sync" Shortcut:
 *   POST /api/hooks/notes   header x-brain-token: <notes key>
 *
 * Simple form (current): the body is the note's plain text (Request Body:
 * File → Text). The reply is plain text — the lines to append to the note, or
 * nothing — so the Shortcut can append it without reading a dictionary.
 *
 * JSON form (older Shortcuts): { "input": "<Shortcut Input>", "text": "<note>" },
 * where the app's 🔄 button sets the input to {"token","section"}. Reply:
 * { ok, message, space, added, append }.
 *
 * Notes are matched to lists by title (first line) via sections.notes_link.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = presentedToken(request);
  let sectionId = url.searchParams.get("section");

  const raw = await request.text();
  let text = raw;
  let keys: string[] = [];
  let plain = true;
  // Field → type/length, for troubleshooting a user's Shortcut (no content).
  let shape: Record<string, string> = {};
  try {
    const json = JSON.parse(raw);
    if (json && typeof json === "object") {
      plain = false;
      keys = Object.keys(json);
      shape = Object.fromEntries(Object.entries(json).map(([k, v]) => [k, typeof v === "string" ? `string:${v.length}` : Array.isArray(v) ? `array:${v.length}` : typeof v]));
      if (typeof json.section === "string" && json.section.trim()) sectionId = json.section.trim();
      // Don't trust field names (they're easy to leave blank in Shortcuts):
      // the {"token","section"} value from the 🔄 button identifies itself, and
      // the note is the longest remaining text.
      const readInput = (v: unknown) => {
        const o = typeof v === "string" && v.trim().startsWith("{") ? JSON.parse(v) : v;
        return o && typeof o === "object" && typeof (o as { token?: unknown }).token === "string" ? (o as { token: string; section?: string }) : null;
      };
      let noteText: string | null = typeof json.text === "string" ? json.text : null;
      for (const v of Object.values(json)) {
        const input = (() => {
          try {
            return readInput(v);
          } catch {
            return null;
          }
        })();
        if (input) {
          token = input.token;
          if (typeof input.section === "string") sectionId = input.section;
        } else if (typeof v === "string" && noteText === null) noteText = v;
        else if (typeof v === "string" && v.length > (noteText?.length ?? 0) && v !== json.section) noteText = v;
      }
      text = noteText ?? "";
    }
  } catch {
    // Plain text body: the note itself.
  }
  if (plain) shape = { body: `text:${raw.length}` };
  // In the simple form whatever we answer gets appended to the note, so errors
  // answer empty (and are visible in the app instead).
  const reply = (append: string, json: Record<string, unknown>, status = 200) =>
    plain ? new NextResponse(append, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }) : NextResponse.json({ append, ...json }, { status });

  if (!token) {
    console.error("[notes-sync] no token", { keys, bodyChars: raw.length, bodyStart: raw.slice(0, 120) });
    const msg = "⚠️ Home Brain didn't get your key. In “Get Contents of URL”, add the x-brain-token header with your Notes sync key (Me → iPhone setup).";
    return reply("", { error: msg, message: msg }, 400);
  }

  const db = createSupabaseAdmin();
  const userId = await authenticateHook(db, token, "notes");
  const { data: me } = userId ? await db.from("profiles").select("*").eq("user_id", userId).maybeSingle<Profile>() : { data: null };
  if (!me?.household_id) return reply("", { error: "invalid token" }, 401);

  const visible = (s: Pick<Section, "owner_id" | "household_id"> | null) => !!s && s.household_id === me.household_id && (!s.owner_id || s.owner_id === me.user_id);
  // A note's title is its first line; lists are linked to notes by that title.
  const title = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const placeholder = /^(text|טקסט|selected item|הפריט שנבחר|note|פתק|shortcut input|notes|פתקים)$/i.test(title);
  const findLinked = async () => {
    if (!title || placeholder) return null;
    const { data } = await db.from("sections").select("*").eq("household_id", me.household_id).ilike("notes_link", title.replace(/[%_]/g, "\\$&")).returns<Section[]>();
    return (data ?? []).find(visible) ?? null;
  };
  let section: Section | null = null;
  if (sectionId && /^[0-9a-f-]{36}$/i.test(sectionId)) {
    // Run from a list's 🔄 button. The automatic Shortcut loops over recent
    // notes, so once the list is linked only its own note may sync into it.
    const { data } = await db.from("sections").select("*").eq("id", sectionId).maybeSingle<Section>();
    const tapped = visible(data) ? data : null;
    if (!tapped) return reply("", { error: "list not found" }, 404);
    if (!tapped.notes_link || !text.trim() || placeholder) {
      section = tapped;
      if (title && !placeholder && !tapped.notes_link) await db.from("sections").update({ notes_link: title, notes_state: null }).eq("id", tapped.id);
    } else section = await findLinked();
  } else section = await findLinked();
  if (!section) {
    // The simple Shortcut sends whichever note was edited last; note what came
    // so a 🔄 tap in the app can explain why nothing synced.
    if (plain) {
      await db.from("events").insert({
        user_id: me.user_id,
        type: "notes_sync",
        payload: { section: null, problem: !text.trim() ? "empty" : placeholder ? "literal" : "unlinked", sample: title.slice(0, 80), chars: text.length, shape },
      });
    }
    return reply("", { ok: true, linked: false, message: "" });
  }

  const he = me.locale === "he";
  // Common Shortcut slip: typing the variable's name instead of picking the variable.
  const literal = /^(text|טקסט|selected item|הפריט שנבחר|note|פתק|shortcut input|notes|פתקים)$/i.test(text.trim());
  const problem = !text.trim() ? "empty" : literal ? "literal" : null;
  const lines = problem ? [] : noteLines(text);
  const { data: items } = await db.from("items").select("id,title,done,position,props").eq("section_id", section.id);
  const { toAdd, toCheck, toUncheck, toDelete: removed, append, state } = problem
    ? { toAdd: [], toCheck: [], toUncheck: [], toDelete: [], append: [], state: null }
    : mergeNote(lines, items ?? [], (section.notes_state as NoteState | null) ?? null);
  // Items with photos are never deleted from here (their files would be orphaned).
  const hasPhotos = (props: unknown) => Array.isArray((props as Record<string, unknown> | null)?._photos) && ((props as Record<string, unknown[]>)._photos.length > 0);
  const toDelete = removed.filter((id) => !hasPhotos(items?.find((i) => i.id === id)?.props));
  const now = new Date().toISOString();
  if (toAdd.length) {
    const top = Math.max(0, ...(items ?? []).map((i) => i.position ?? 0));
    await db.from("items").insert(toAdd.map((l, i) => ({ section_id: section.id, title: l.title, done: l.checked, position: top + i + 1, created_by: me.user_id })));
  }
  if (toCheck.length) await db.from("items").update({ done: true, updated_at: now }).in("id", toCheck);
  if (toUncheck.length) await db.from("items").update({ done: false, updated_at: now }).in("id", toUncheck);
  if (toDelete.length) await db.from("items").delete().in("id", toDelete);
  if (state) await db.from("sections").update({ notes_state: state }).eq("id", section.id);
  const message =
    problem === "empty"
      ? he
        ? "⚠️ הפתק הגיע ריק. בקיצור, ״קבלת טקסט מ…״ צריך להראות פתקים, וגוף הבקשה ← קובץ צריך להיות הבועה ״טקסט״."
        : "⚠️ The note arrived empty. In the Shortcut, “Get Text from” should show Notes, and Request Body → File should be the Text bubble."
      : problem === "literal"
        ? he
          ? `⚠️ הגיעה המילה ״${text.trim()}״ במקום הפתק — מחקו אותה ובחרו את הבועה ״טקסט״ מעל המקלדת.`
          : `⚠️ The word “${text.trim()}” arrived instead of the note — delete it and pick the “Text” bubble above the keyboard.`
        : he
          ? `✓ ${section.title}: נוספו ${toAdd.length} מהפתק · ${toCheck.length} סומנו · ${toUncheck.length} בוטל סימון · ${toDelete.length} נמחקו · ${append.length} נוספו לפתק`
          : `✓ ${section.title}: +${toAdd.length} from the note · ${toCheck.length} ticked · ${toUncheck.length} unticked · ${toDelete.length} removed · ${append.length} added to the note`;
  await db.from("events").insert({
    user_id: me.user_id,
    type: "notes_sync",
    payload: { section: section.id, problem, chars: text.length, lines: lines.length, added: toAdd.length, checked: toCheck.length, unchecked: toUncheck.length, removed: toDelete.length, appended: append.length, sample: text.slice(0, 80), shape, bodyChars: raw.length },
  });
  return reply(problem ? "" : append.join("\n"), { ok: !problem, message, space: section.title, added: toAdd.length, unchecked: toUncheck.length, removed: toDelete.length });
}
