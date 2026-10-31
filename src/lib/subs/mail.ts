import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAttachment, getMessage, GoogleAuthError, openToken, refreshAccess } from "./gmail";
import { readSub } from "./types";

// Reading one email a bill came from, inside the app (Gmail's own links don't
// open on a phone). Only messages recorded as a charge in a space the person can
// see: the link can't be used to read anything else in that inbox.

export type MailView =
  | { ok: true; from: string; subject: string; date: Date; text: string; pdfs: string[] }
  | { ok: false; error: "not_found" | "expired" | "failed" };

/** `db` is the signed-in person's client, so RLS decides which spaces they see. */
async function isRecordedCharge(db: SupabaseClient, sectionId: string, messageId: string) {
  const { data } = await db.from("items").select("props").eq("section_id", sectionId);
  return (data ?? []).some((i) => readSub(i.props)?.charges?.some((c) => c.id === messageId));
}

async function openMessage(db: SupabaseClient, sectionId: string, messageId: string) {
  if (!(await isRecordedCharge(db, sectionId, messageId))) return null;
  const { data: conn } = await createSupabaseAdmin().from("gmail_connections").select("refresh_token").eq("section_id", sectionId).maybeSingle<{ refresh_token: string }>();
  if (!conn) return null;
  const access = await refreshAccess(openToken(conn.refresh_token));
  return { access, message: await getMessage(access, messageId) };
}

export async function readMail(db: SupabaseClient, sectionId: string, messageId: string): Promise<MailView> {
  try {
    const opened = await openMessage(db, sectionId, messageId);
    if (!opened) return { ok: false, error: "not_found" };
    const { from, subject, date, text, pdfs } = opened.message;
    return { ok: true, from, subject, date, text, pdfs: pdfs.map((p) => p.filename) };
  } catch (e) {
    if (e instanceof GoogleAuthError) return { ok: false, error: "expired" };
    console.error("[gmail] read mail failed", e);
    return { ok: false, error: "failed" };
  }
}

/**
 * The `n`th PDF attached to such a message, or null. By position: Gmail hands
 * out a new attachment id every time a message is fetched.
 */
export async function readMailPdf(db: SupabaseClient, sectionId: string, messageId: string, n: number) {
  const opened = await openMessage(db, sectionId, messageId).catch(() => null);
  const pdf = opened?.message.pdfs[n];
  if (!opened || !pdf) return null;
  return { filename: pdf.filename, bytes: await getAttachment(opened.access, messageId, pdf.attachmentId) };
}
