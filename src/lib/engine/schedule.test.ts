import { describe, expect, it } from "vitest";
import { conditionsPass, nextRunAt } from "./schedule";
import { localDateKey, zonedParts, zonedTimeToUtc } from "./time";

const TZ = "Asia/Jerusalem";

describe("zonedTimeToUtc", () => {
  it("converts Israel summer time (UTC+3)", () => {
    expect(zonedTimeToUtc(2026, 7, 1, 7, 30, TZ).toISOString()).toBe("2026-07-01T04:30:00.000Z");
  });

  it("converts Israel winter time (UTC+2)", () => {
    expect(zonedTimeToUtc(2026, 12, 1, 7, 30, TZ).toISOString()).toBe("2026-12-01T05:30:00.000Z");
  });

  it("round-trips through zonedParts", () => {
    const d = zonedTimeToUtc(2026, 3, 15, 18, 45, "America/New_York");
    expect(zonedParts(d, "America/New_York")).toMatchObject({ year: 2026, month: 3, day: 15, hour: 18, minute: 45 });
  });
});

describe("nextRunAt", () => {
  const workout = { type: "schedule" as const, days: [0, 2, 4], times: ["18:30"] }; // Sun, Tue, Thu

  it("returns the same day when the time is still ahead", () => {
    // Sat 2026-10-17 is a Saturday; Sun 2026-10-18 10:00 local
    const after = zonedTimeToUtc(2026, 10, 18, 10, 0, TZ);
    expect(nextRunAt(workout, after, TZ)?.toISOString()).toBe(zonedTimeToUtc(2026, 10, 18, 18, 30, TZ).toISOString());
  });

  it("skips to the next allowed weekday", () => {
    const after = zonedTimeToUtc(2026, 10, 18, 19, 0, TZ); // Sun after 18:30 → Tue
    expect(nextRunAt(workout, after, TZ)?.toISOString()).toBe(zonedTimeToUtc(2026, 10, 20, 18, 30, TZ).toISOString());
  });

  it("is strictly after `after` (no double fire at the exact minute)", () => {
    const at = zonedTimeToUtc(2026, 10, 18, 18, 30, TZ);
    expect(nextRunAt(workout, at, TZ)?.getTime()).toBeGreaterThan(at.getTime());
  });

  it("picks the earliest of multiple times", () => {
    const t = { type: "schedule" as const, days: [0, 1, 2, 3, 4, 5, 6], times: ["20:00", "08:00"] };
    const after = zonedTimeToUtc(2026, 10, 18, 9, 0, TZ);
    expect(zonedParts(nextRunAt(t, after, TZ)!, TZ)).toMatchObject({ day: 18, hour: 20, minute: 0 });
  });

  it("keeps wall-clock time across the October DST change", () => {
    // Israel leaves DST on Sun 2026-10-25. A daily 07:00 must stay 07:00 local.
    const t = { type: "schedule" as const, days: [0, 1, 2, 3, 4, 5, 6], times: ["07:00"] };
    const before = nextRunAt(t, zonedTimeToUtc(2026, 10, 24, 8, 0, TZ), TZ)!;
    expect(zonedParts(before, TZ)).toMatchObject({ day: 25, hour: 7, minute: 0 });
    expect(before.toISOString()).toBe("2026-10-25T05:00:00.000Z");
  });

  it("fires once, at a sensible time, when the time doesn't exist on the spring-forward day", () => {
    // Israel skips 02:00-03:00 local on Fri 2027-03-26.
    const daily = { type: "schedule" as const, days: [0, 1, 2, 3, 4, 5, 6], times: ["02:30"] };
    const first = nextRunAt(daily, zonedTimeToUtc(2027, 3, 26, 0, 0, TZ), TZ)!;
    expect(localDateKey(first, TZ)).toBe("2027-03-26");
    const local = zonedParts(first, TZ);
    expect(local.hour === 1 || local.hour === 3).toBe(true); // just around the gap, never skipped
    const second = nextRunAt(daily, first, TZ)!;
    expect(localDateKey(second, TZ)).toBe("2027-03-27");
    expect(zonedParts(second, TZ)).toMatchObject({ hour: 2, minute: 30 });
  });

  it("returns null for event triggers", () => {
    expect(nextRunAt({ type: "event", event: "wake", delayMinutes: 0 }, new Date(), TZ)).toBeNull();
  });
});

describe("conditionsPass", () => {
  const now = zonedTimeToUtc(2026, 10, 18, 7, 15, TZ); // Sunday 07:15

  it("checks time windows, including ones that wrap midnight", () => {
    expect(conditionsPass([{ type: "time_window", from: "05:00", to: "11:00" }], { now, timeZone: TZ, lastFiredAt: null })).toBe(true);
    expect(conditionsPass([{ type: "time_window", from: "12:00", to: "18:00" }], { now, timeZone: TZ, lastFiredAt: null })).toBe(false);
    expect(conditionsPass([{ type: "time_window", from: "22:00", to: "08:00" }], { now, timeZone: TZ, lastFiredAt: null })).toBe(true);
  });

  it("checks weekdays", () => {
    expect(conditionsPass([{ type: "days", days: [0] }], { now, timeZone: TZ, lastFiredAt: null })).toBe(true);
    expect(conditionsPass([{ type: "days", days: [5, 6] }], { now, timeZone: TZ, lastFiredAt: null })).toBe(false);
  });

  it("once_per_day uses the local calendar day, not UTC", () => {
    const lastNightLocal = zonedTimeToUtc(2026, 10, 18, 1, 0, TZ); // same local day, previous UTC day
    expect(localDateKey(lastNightLocal, "UTC")).toBe("2026-10-17");
    expect(conditionsPass([{ type: "once_per_day" }], { now, timeZone: TZ, lastFiredAt: lastNightLocal })).toBe(false);
    const yesterday = zonedTimeToUtc(2026, 10, 17, 23, 0, TZ);
    expect(conditionsPass([{ type: "once_per_day" }], { now, timeZone: TZ, lastFiredAt: yesterday })).toBe(true);
  });
});
