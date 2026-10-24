import { describe, expect, it } from "vitest";
import { alertTimes, currentOccurrence, defaultDate, nextDateReminder, nextOccurrence, occursOn, type DateSpec } from "./dates";

const TZ = "Asia/Jerusalem";
// 2026-10-23 is a Friday; Israel is UTC+3 until 2026-10-25.
const local = (day: string, time: string) => new Date(`${day}T${time}:00+03:00`);
const spec = (p: Partial<DateSpec>): DateSpec => ({ ...defaultDate("2026-10-23"), ...p });
const fmt = (r: ReturnType<typeof nextDateReminder>) => r && { at: r.at.toISOString(), kind: r.kind, occurrence: r.occurrence };

describe("occursOn", () => {
  it("once / monthly / yearly", () => {
    expect(occursOn(spec({}), "2026-10-23")).toBe(true);
    expect(occursOn(spec({}), "2026-11-23")).toBe(false);
    expect(occursOn(spec({ repeat: "monthly" }), "2026-11-23")).toBe(true);
    expect(occursOn(spec({ repeat: "monthly" }), "2026-09-23")).toBe(false);
    expect(occursOn(spec({ repeat: "yearly" }), "2027-10-23")).toBe(true);
    expect(occursOn(spec({ repeat: "yearly" }), "2027-11-23")).toBe(false);
  });

  it("day 31 and Feb 29 fall back to the month's last day", () => {
    expect(occursOn(spec({ date: "2026-01-31", repeat: "monthly" }), "2026-02-28")).toBe(true);
    expect(occursOn(spec({ date: "2028-02-29", repeat: "yearly" }), "2029-02-28")).toBe(true);
    expect(nextOccurrence(spec({ date: "2026-01-31", repeat: "monthly" }), "2026-04-01")).toBe("2026-04-30");
  });
});

describe("alertTimes", () => {
  it("every N hours inside the window, or a single alert", () => {
    expect(alertTimes(spec({ from: "09:00", until: "21:00", every: 3 }))).toEqual(["09:00", "12:00", "15:00", "18:00", "21:00"]);
    expect(alertTimes(spec({ every: 0, from: "10:30" }))).toEqual(["10:30"]);
  });
});

describe("nextDateReminder", () => {
  const never = () => false;

  it("nags through the day until handled, then stops", () => {
    const s = spec({ every: 4 }); // 09:00, 13:00, 17:00, 21:00
    expect(fmt(nextDateReminder(s, local("2026-10-23", "08:00"), TZ, never))).toEqual({ at: local("2026-10-23", "09:00").toISOString(), kind: "day", occurrence: "2026-10-23" });
    expect(fmt(nextDateReminder(s, local("2026-10-23", "09:00"), TZ, never))?.at).toBe(local("2026-10-23", "13:00").toISOString());
    expect(nextDateReminder(s, local("2026-10-23", "21:00"), TZ, never)).toBeNull();
    expect(nextDateReminder(s, local("2026-10-23", "10:00"), TZ, (d) => d === "2026-10-23")).toBeNull();
  });

  it("monthly: handled this month → next month's date", () => {
    const s = spec({ repeat: "monthly", every: 0 });
    const r = nextDateReminder(s, local("2026-10-23", "08:00"), TZ, (d) => d === "2026-10-23");
    expect(r?.occurrence).toBe("2026-11-23");
    expect(r?.kind).toBe("day");
  });

  it("heads-up N days before", () => {
    const s = spec({ date: "2026-10-30", ahead: 3, every: 0 });
    expect(fmt(nextDateReminder(s, local("2026-10-23", "12:00"), TZ, never))).toEqual({ at: new Date("2026-10-27T09:00:00+02:00").toISOString(), kind: "ahead", occurrence: "2026-10-30" });
  });

  it("carry: keeps alerting on the next days while open, never past the window", () => {
    const s = spec({ every: 0, carry: true });
    const r = nextDateReminder(s, local("2026-10-23", "10:00"), TZ, never);
    expect(r?.kind).toBe("carry");
    expect(r?.occurrence).toBe("2026-10-23");
    expect(r?.day).toBe("2026-10-24");
    expect(nextDateReminder(s, new Date("2026-11-07T10:00:00+02:00"), TZ, never)).toBeNull();
    expect(nextDateReminder(spec({ every: 0 }), local("2026-10-23", "10:00"), TZ, never)).toBeNull();
  });
});

describe("currentOccurrence", () => {
  it("today, a carried earlier date, or the coming one", () => {
    expect(currentOccurrence(spec({}), "2026-10-23", () => false)).toBe("2026-10-23");
    expect(currentOccurrence(spec({ carry: true }), "2026-10-25", () => false)).toBe("2026-10-23");
    expect(currentOccurrence(spec({ date: "2026-10-30" }), "2026-10-27", () => false)).toBe("2026-10-30");
  });
});
