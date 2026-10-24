import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleAuthError, openToken, refreshAccess } from "@/lib/subs/gmail";

// Google Calendar: create / move / delete events in the user's primary calendar.
// Uses the same OAuth client as Gmail with its own scope and its own connection.

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
/** signState() space marker for the calendar round trip (Gmail uses a section id). */
export const CALENDAR_STATE = "calendar";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary";

export interface CalendarEvent {
  title: string;
  description?: string;
  /** All-day on this local day (YYYY-MM-DD)... */
  day?: string;
  /** ...or timed. */
  start?: Date;
  end?: Date;
  timeZone: string;
}

/** Google's event body for an all-day or timed event. */
export function eventBody(e: CalendarEvent) {
  const when = e.day
    ? { start: { date: e.day }, end: { date: nextDay(e.day) } }
    : { start: { dateTime: e.start!.toISOString(), timeZone: e.timeZone }, end: { dateTime: e.end!.toISOString(), timeZone: e.timeZone } };
  return { summary: e.title, description: e.description, ...when };
}

function nextDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function call<T>(access: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new GoogleAuthError("unauthorized");
  if (res.status === 404 || res.status === 410) return null as T;
  if (!res.ok) throw new Error(`calendar ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

/** The connected account's address (the primary calendar's id). */
export const calendarAccount = async (access: string) => (await call<{ id: string }>(access, "GET", ""))?.id ?? null;

/** An access token for this user's calendar, or null when not connected (marks expired ones). */
export async function calendarAccess(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from("calendar_connections").select("refresh_token,status").eq("user_id", userId).maybeSingle();
  if (!data || data.status !== "ok") return null;
  try {
    return await refreshAccess(openToken(data.refresh_token));
  } catch (e) {
    if (e instanceof GoogleAuthError) await db.from("calendar_connections").update({ status: "expired" }).eq("user_id", userId);
    return null;
  }
}

/** Creates the event, or moves it when `eventId` still exists. Returns the event id. */
export async function upsertEvent(access: string, e: CalendarEvent, eventId?: string | null): Promise<string> {
  if (eventId) {
    const moved = await call<{ id: string } | null>(access, "PATCH", `/events/${encodeURIComponent(eventId)}`, eventBody(e));
    if (moved) return moved.id;
  }
  return (await call<{ id: string }>(access, "POST", "/events", eventBody(e))).id;
}

export async function deleteEvent(access: string, eventId: string) {
  await call(access, "DELETE", `/events/${encodeURIComponent(eventId)}`);
}
