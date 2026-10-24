// Commitments: "no more than ₪300 on Cibus this month", "laundry today".
// Each item in a Commitments space keeps its spec in props._commit.
import { zonedParts, zonedTimeToUtc } from "./engine/time";

export const COMMIT_PROP = "_commit";

export type Period = "hour" | "day" | "week" | "month" | "year";
export const PERIODS: Period[] = ["hour", "day", "week", "month", "year"];

export interface CommitEntry {
  at: string;
  amount: number;
  note?: string;
}

export interface CommitSpec {
  period: Period;
  start: string;
  end: string;
  /** "Stay under" commitments: at most this much in the period (e.g. 300 ₪). Without it, it's a did-it / didn't. */
  limit?: number;
  unit?: string;
  /** Spending (or count) logged against the limit. */
  log?: CommitEntry[];
  result?: "kept" | "broken";
  /** What to do differently next time. */
  lesson?: string;
}

export function readCommit(props: Record<string, unknown>): CommitSpec | null {
  const c = props[COMMIT_PROP] as CommitSpec | undefined;
  return c && typeof c.end === "string" && PERIODS.includes(c.period) ? c : null;
}

/** When a commitment made at `now` for this period ends: end of this hour / day / week (Sat night) / month / year, local time. */
export function periodEnd(period: Period, now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  switch (period) {
    case "hour":
      return new Date(now.getTime() + 60 * 60000);
    case "day":
      return zonedTimeToUtc(p.year, p.month, p.day, 23, 59, timeZone);
    case "week": {
      // Israeli week: Sunday..Saturday.
      const d = new Date(Date.UTC(p.year, p.month - 1, p.day + (6 - p.weekday)));
      return zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 23, 59, timeZone);
    }
    case "month": {
      const last = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
      return zonedTimeToUtc(p.year, p.month, last, 23, 59, timeZone);
    }
    case "year":
      return zonedTimeToUtc(p.year, 12, 31, 23, 59, timeZone);
  }
}

export const spent = (c: CommitSpec) => (c.log ?? []).reduce((s, e) => s + e.amount, 0);

/** Kept / broken once decided; a limit commitment is broken the moment it goes over, and kept at the end if it didn't. */
export function status(c: CommitSpec, now = new Date()): "active" | "kept" | "broken" | "ask" {
  if (c.result) return c.result;
  if (c.limit !== undefined && spent(c) > c.limit) return "broken";
  if (now.getTime() < Date.parse(c.end)) return "active";
  return c.limit !== undefined ? "kept" : "ask";
}

const WORDS: [RegExp, Period][] = [
  [/\b(this|next|in an?|within the)\s+hour\b|השעה|בשעה הקרובה|תוך שעה/i, "hour"],
  [/\btoday\b|\btonight\b|היום|הערב/i, "day"],
  [/\b(this|a)\s+week\b|השבוע/i, "week"],
  [/\b(this|a)\s+month\b|החודש|בחודש/i, "month"],
  [/\b(this|a)\s+year\b|השנה|בשנה/i, "year"],
];

/**
 * Reads a spoken commitment: "no more than 300 shekel on Cibus this month",
 * "לא יותר מ-300 שקל בסיבוס החודש", "laundry today". Defaults to today.
 */
export function parseCommit(text: string): { title: string; period: Period; limit?: number; unit?: string } {
  const title = text.trim().replace(/^(commit(ment)?( to)?|i commit to|אני מתחייב(ת)? ל?|התחייבות:?)\s*/i, "").replace(/[.!]+$/, "");
  const period = WORDS.find(([re]) => re.test(title))?.[1] ?? "day";
  const cap = title.match(/(?:no more than|not more than|under|less than|max(?:imum)?|up to|at most|לא יותר מ-?|עד|פחות מ-?|מקסימום)\s*₪?\s*(\d+(?:\.\d+)?)\s*(₪|shekels?|nis|ils|\$|dollars?|ש"ח|שח|שקל(?:ים)?)?/i);
  if (!cap) return { title, period };
  const unit = cap[2] && /\$|dollar/i.test(cap[2]) ? "$" : cap[2] || /₪/.test(cap[0]) ? "₪" : undefined;
  return { title, period, limit: Number(cap[1]), unit };
}

export interface CommitSummary {
  total: number;
  kept: number;
  broken: number;
  active: number;
  /** Kept share of decided commitments, 0..100 (null before any is decided). */
  rate: number | null;
  /** Kept in a row, most recent first. */
  streak: number;
  byPeriod: Record<Period, { kept: number; broken: number }>;
}

export function summarize(specs: CommitSpec[], now = new Date()): CommitSummary {
  const byPeriod = Object.fromEntries(PERIODS.map((p) => [p, { kept: 0, broken: 0 }])) as CommitSummary["byPeriod"];
  let kept = 0;
  let broken = 0;
  let active = 0;
  for (const c of specs) {
    const s = status(c, now);
    if (s === "kept") {
      kept++;
      byPeriod[c.period].kept++;
    } else if (s === "broken") {
      broken++;
      byPeriod[c.period].broken++;
    } else active++;
  }
  const decided = specs.filter((c) => ["kept", "broken"].includes(status(c, now))).sort((a, b) => b.end.localeCompare(a.end));
  let streak = 0;
  for (const c of decided) {
    if (status(c, now) !== "kept") break;
    streak++;
  }
  return { total: specs.length, kept, broken, active, rate: kept + broken ? Math.round((kept / (kept + broken)) * 100) : null, streak, byPeriod };
}

/** A new commitment item from what was typed or said: title, spec, and the end-of-period check. */
export function newCommit(text: string, now: Date, timeZone: string, period?: Period) {
  const parsed = parseCommit(text);
  const p = period ?? parsed.period;
  const spec: CommitSpec = {
    period: p,
    start: now.toISOString(),
    end: periodEnd(p, now, timeZone).toISOString(),
    ...(parsed.limit !== undefined ? { limit: parsed.limit, unit: parsed.unit ?? "₪", log: [] } : {}),
  };
  return { title: parsed.title, props: { [COMMIT_PROP]: spec }, remind_at: spec.end };
}

export const commitProps = (props: Record<string, unknown>, spec: CommitSpec) => ({ ...props, [COMMIT_PROP]: spec });
