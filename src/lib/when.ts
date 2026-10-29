// Quick-add (roadmap 2.3): pull a day and time out of "dentist Tuesday 10".
import { addDays } from "@/lib/engine/habits";

const DAYS: [RegExp, number][] = [
  [/\b(sun(day)?)\b|(?:ב?יום\s+)?ראשון/i, 0],
  [/\b(mon(day)?)\b|(?:ב?יום\s+)?שני(?!ם)/i, 1],
  [/\b(tue(s|sday)?)\b|(?:ב?יום\s+)?שלישי/i, 2],
  [/\b(wed(nesday)?)\b|(?:ב?יום\s+)?רביעי/i, 3],
  [/\b(thu(rs|rsday)?)\b|(?:ב?יום\s+)?חמישי/i, 4],
  [/\b(fri(day)?)\b|(?:ב?יום\s+)?שישי/i, 5],
  [/\b(sat(urday)?)\b|(?:ב?יום\s+)?(שבת|בשבת)/i, 6],
];

export interface When {
  text: string;
  /** YYYY-MM-DD, or null when no day was said. */
  day: string | null;
  /** HH:MM, or null. */
  time: string | null;
}

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const pad = (n: number) => String(n).padStart(2, "0");

/** `today` is the local YYYY-MM-DD. A weekday always means the next one, never today. */
export function parseWhen(raw: string, today: string): When {
  let text = ` ${raw.trim()} `;
  let day: string | null = null;
  let time: string | null = null;
  const take = (re: RegExp) => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], " ");
    return m;
  };

  if (take(/\s(today|היום)\s/i)) day = today;
  else if (take(/\s(tomorrow|מחר)\s/i)) day = addDays(today, 1);
  else {
    const date = take(/\s(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\s/);
    if (date) {
      const year = date[3] ? (date[3].length === 2 ? 2000 + Number(date[3]) : Number(date[3])) : Number(today.slice(0, 4));
      let d = `${year}-${pad(Number(date[2]))}-${pad(Number(date[1]))}`;
      if (!date[3] && d < today) d = `${year + 1}${d.slice(4)}`;
      day = d;
    } else {
      for (const [re, n] of DAYS) {
        if (take(new RegExp(`\\s(?:on\\s+)?(?:${re.source})\\s`, "i"))) {
          const diff = (n - weekday(today) + 7) % 7 || 7;
          day = addDays(today, diff);
          break;
        }
      }
    }
  }

  // A clock time: "18:30", "4pm", or a bare hour only when a day was said ("Tuesday 10").
  const clock = take(/\s(?:at\s+|ב-?|בשעה\s+)?(\d{1,2}):(\d{2})\s/i) ?? take(/\s(?:at\s+)?(\d{1,2})\s*(am|pm)\s/i) ?? (day ? take(/\s(?:at\s+|ב-?|בשעה\s+)?(\d{1,2})\s*$/) : null);
  if (clock) {
    let h = Number(clock[1]);
    const ampm = /^(am|pm)$/i.test(clock[2] ?? "") ? clock[2].toLowerCase() : null;
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const m = ampm || !clock[2] ? 0 : Number(clock[2]);
    if (h < 24 && m < 60) time = `${pad(h)}:${pad(m)}`;
    day ??= today;
  }

  text = text.replace(/\s+(at|on|ב|ביום)\s*$/i, " ").replace(/\s+/g, " ").trim();
  return { text, day, time };
}
