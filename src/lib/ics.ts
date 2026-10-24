// Minimal RFC 5545 writer: enough for Apple/Google Calendar to import events.
import { addDays, todayKey } from "@/lib/engine/habits";

export interface IcsEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  /** For all-day events: the zone whose calendar day `start` falls on (default UTC). `end` is then ignored. */
  timeZone?: string;
  description?: string;
  url?: string;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const compact = (day: string) => day.replace(/-/g, "");

/** DTSTART/DTEND days for an all-day event, on the calendar day `start` falls on in `timeZone`. */
export function allDayRange(e: Pick<IcsEvent, "start" | "end" | "timeZone">): [string, string] {
  if (!e.timeZone) return [compact(e.start.toISOString().slice(0, 10)), compact(e.end.toISOString().slice(0, 10))];
  const day = todayKey(e.timeZone, e.start);
  return [compact(day), compact(addDays(day, 1))];
}

function escape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
}

/** Folds lines at 75 octets as the spec requires (approximated by characters). */
function fold(line: string) {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 73) out.push((i ? " " : "") + line.slice(i, i + 73));
  return out.join("\r\n");
}

export function buildIcs(calendarName: string, events: IcsEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Home Brain//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escape(calendarName)}`];
  const now = stamp(new Date());
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${now}`, `SUMMARY:${escape(e.title)}`);
    if (e.allDay) {
      const [from, to] = allDayRange(e);
      lines.push(`DTSTART;VALUE=DATE:${from}`, `DTEND;VALUE=DATE:${to}`);
    } else {
      lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`);
    }
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
