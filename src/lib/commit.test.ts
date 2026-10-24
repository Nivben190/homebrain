import { describe, expect, it } from "vitest";
import { parseCommit, periodEnd, status, summarize, type CommitSpec } from "./commit";
import { zonedParts } from "./engine/time";

const TZ = "Asia/Jerusalem";
const now = new Date("2026-10-24T09:00:00Z"); // Saturday 12:00 in Israel

describe("periodEnd", () => {
  it("ends days, weeks, months and years at 23:59 local", () => {
    expect(zonedParts(periodEnd("day", now, TZ), TZ)).toMatchObject({ day: 24, hour: 23, minute: 59 });
    expect(zonedParts(periodEnd("week", new Date("2026-10-20T09:00:00Z"), TZ), TZ)).toMatchObject({ day: 24, weekday: 6 });
    expect(zonedParts(periodEnd("month", now, TZ), TZ)).toMatchObject({ month: 10, day: 31, hour: 23 });
    expect(zonedParts(periodEnd("year", now, TZ), TZ)).toMatchObject({ month: 12, day: 31 });
    expect(periodEnd("hour", now, TZ).getTime() - now.getTime()).toBe(3600000);
  });
});

describe("parseCommit", () => {
  it("reads a spending limit in English and Hebrew", () => {
    expect(parseCommit("No more than 300 shekel on Cibus this month")).toMatchObject({ period: "month", limit: 300, unit: "₪" });
    expect(parseCommit("לא יותר מ-300 שקל בסיבוס החודש")).toMatchObject({ period: "month", limit: 300, unit: "₪" });
  });
  it("reads plain to-dos and defaults to today", () => {
    expect(parseCommit("commit to put laundry today")).toEqual({ title: "put laundry today", period: "day" });
    expect(parseCommit("להתקשר לסבתא השבוע")).toEqual({ title: "להתקשר לסבתא השבוע", period: "week" });
    expect(parseCommit("gym 3 times")).toEqual({ title: "gym 3 times", period: "day" });
  });
});

describe("status & summary", () => {
  const spec = (p: Partial<CommitSpec>): CommitSpec => ({ period: "month", start: "2026-10-01T00:00:00Z", end: "2026-10-31T21:00:00Z", ...p });
  it("limit commitments break when over and are kept at the end otherwise", () => {
    expect(status(spec({ limit: 300, log: [{ at: "x", amount: 120 }] }), now)).toBe("active");
    expect(status(spec({ limit: 300, log: [{ at: "x", amount: 320 }] }), now)).toBe("broken");
    expect(status(spec({ limit: 300, log: [{ at: "x", amount: 299 }] }), new Date("2026-11-01T00:00:00Z"))).toBe("kept");
  });
  it("did-it commitments ask at the end until answered", () => {
    expect(status(spec({}), new Date("2026-11-01T00:00:00Z"))).toBe("ask");
    expect(status(spec({ result: "kept" }), now)).toBe("kept");
  });
  it("sums up kept rate, streak and per period", () => {
    const s = summarize(
      [
        spec({ result: "kept", end: "2026-10-03T00:00:00Z" }),
        spec({ result: "broken", end: "2026-10-02T00:00:00Z" }),
        spec({ result: "kept", end: "2026-10-04T00:00:00Z", period: "day" }),
        spec({}),
      ],
      now,
    );
    expect(s).toMatchObject({ total: 4, kept: 2, broken: 1, active: 1, rate: 67, streak: 2 });
    expect(s.byPeriod.day).toEqual({ kept: 1, broken: 0 });
  });
});
