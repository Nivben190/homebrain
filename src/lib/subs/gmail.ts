import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { htmlToText, type MailMessage } from "./parse";

// Google OAuth + the two Gmail calls we need (list + get), with plain fetch.
// Scope is read-only: the app can never send, delete or change mail.

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const gmailConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_KEY);
const redirectUri = (origin: string) => `${origin}/api/google/callback`;

export function googleAuthUrl(origin: string, state: string, scope = GMAIL_SCOPE) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope,
    access_type: "offline",
    // Pick any account (each space can track a different inbox), and always
    // consent so Google returns a refresh token even on a reconnect.
    prompt: "select_account consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export class GoogleAuthError extends Error {}
export class GmailApiDisabled extends Error {}
/** Gmail kept saying "too many requests" after every retry: try this inbox again later. */
export class GmailRateLimited extends Error {}

/** How long the first retry waits; tests shorten it. */
export const gmailBackoff = { ms: 2000 };

async function token(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; scope?: string; error?: string };
  // invalid_grant = revoked, expired (7-day tokens in "Testing" mode) or password changed.
  if (json.error === "invalid_grant") throw new GoogleAuthError(json.error);
  if (!res.ok || !json.access_token) throw new Error(`google token: ${json.error ?? res.status}`);
  return json;
}

export const exchangeCode = (code: string, origin: string) => token({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
export const refreshAccess = async (refreshToken: string) => (await token({ grant_type: "refresh_token", refresh_token: refreshToken })).access_token!;

export async function revokeToken(t: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMITED = /quota|rate ?limit|too many/i;

/** One Gmail call; backs off and retries when Google says we're going too fast. */
async function gmail<T>(access: string, path: string, attempt = 0): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401) throw new GoogleAuthError("unauthorized");
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429 || (res.status === 403 && RATE_LIMITED.test(text))) {
      if (attempt >= 4) throw new GmailRateLimited(text.slice(0, 300));
      await sleep(gmailBackoff.ms * 2 ** attempt + Math.random() * (gmailBackoff.ms / 2));
      return gmail<T>(access, path, attempt + 1);
    }
    // Step 2 of the setup: the Gmail API must be enabled in the Cloud project.
    if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(text)) throw new GmailApiDisabled(text.slice(0, 300));
    throw new Error(`gmail ${path.split("?")[0]}: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export const gmailAddress = async (access: string) => (await gmail<{ emailAddress: string }>(access, "/profile")).emailAddress;

export async function listMessageIds(access: string, q: string, max: number) {
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const p = new URLSearchParams({ q, maxResults: String(Math.min(100, max - ids.length)) });
    if (page) p.set("pageToken", page);
    const r = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(access, `/messages?${p}`);
    ids.push(...(r.messages ?? []).map((m) => m.id));
    page = r.nextPageToken;
  } while (page && ids.length < max);
  return ids;
}

interface Part {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
}

/** A PDF attached to a message, fetched only when needed (getAttachment). */
export interface PdfRef {
  attachmentId: string;
  size: number;
  filename: string;
}

/** Bills and receipts are small; anything bigger is a brochure or a scan. */
const MAX_PDF = 2_000_000;

function pdfParts(p: Part): PdfRef[] {
  const own = p.body?.attachmentId && (p.mimeType === "application/pdf" || /\.pdf$/i.test(p.filename ?? "")) && (p.body.size ?? 0) <= MAX_PDF ? [{ attachmentId: p.body.attachmentId, size: p.body.size ?? 0, filename: p.filename || "attachment.pdf" }] : [];
  return [...own, ...(p.parts ?? []).flatMap(pdfParts)];
}

function decode(part: Part) {
  const bytes = Buffer.from(part.body!.data!, "base64url");
  const charset = part.headers?.find((h) => h.name.toLowerCase() === "content-type")?.value.match(/charset="?([\w-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

function findPart(p: Part, type: string): Part | null {
  if (p.mimeType === type && p.body?.data) return p;
  for (const c of p.parts ?? []) {
    const f = findPart(c, type);
    if (f) return f;
  }
  return null;
}

export async function getMessage(access: string, id: string): Promise<MailMessage & { pdfs: PdfRef[] }> {
  const m = await gmail<{ id: string; internalDate: string; payload: Part }>(access, `/messages/${id}?format=full`);
  const header = (n: string) => m.payload.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  const html = findPart(m.payload, "text/html");
  const plain = findPart(m.payload, "text/plain");
  const text = html ? htmlToText(decode(html)) : plain ? decode(plain) : "";
  return { id: m.id, from: header("from"), subject: header("subject"), text: text.slice(0, 50000), date: new Date(Number(m.internalDate)), pdfs: pdfParts(m.payload).slice(0, 2) };
}

export async function getAttachment(access: string, messageId: string, attachmentId: string) {
  const r = await gmail<{ data: string }>(access, `/messages/${messageId}/attachments/${attachmentId}`);
  return new Uint8Array(Buffer.from(r.data, "base64url"));
}

// ---------------------------------------------------------------------------- OAuth state

/**
 * Signed state for the Google round trip: who started it, the space to come back
 * to, and when. Signed rather than kept in a cookie, because the iPhone app can
 * come back from Google's page without the cookies it left with.
 */
export function signState(userId: string, sectionId: string) {
  const body = Buffer.from(JSON.stringify({ u: userId, s: sectionId, t: Date.now() })).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

export function readState(state: string): { u: string; s: string } | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const v = JSON.parse(Buffer.from(body, "base64url").toString()) as { u: string; s: string; t: number };
  return Date.now() - v.t < 30 * 60000 ? v : null;
}

// ---------------------------------------------------------------------------- token at rest

/** AES-256-GCM with GOOGLE_TOKEN_KEY (32 bytes, base64): a database leak alone can't read mail. */
const key = () => Buffer.from(process.env.GOOGLE_TOKEN_KEY!, "base64");
/** While rotating (docs/SECRETS.md): the old key still opens what it sealed, until everything is re-sealed. */
const previousKey = () => (process.env.GOOGLE_TOKEN_KEY_PREVIOUS ? Buffer.from(process.env.GOOGLE_TOKEN_KEY_PREVIOUS, "base64") : null);

export function sealToken(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64")}`;
}

function openWith(k: Buffer, raw: Buffer) {
  const d = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

export function openToken(sealed: string) {
  const raw = Buffer.from(sealed.slice(3), "base64");
  try {
    return openWith(key(), raw);
  } catch (e) {
    const old = previousKey();
    if (!old) throw e;
    return openWith(old, raw);
  }
}

/** Sealed with the current key already (the auth tag only checks out with the right key). */
export function sealedWithCurrentKey(sealed: string) {
  try {
    openWith(key(), Buffer.from(sealed.slice(3), "base64"));
    return true;
  } catch {
    return false;
  }
}
