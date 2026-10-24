import { describe, expect, it } from "vitest";
import { addDays, assigneesFor, habitStats, heatmap, isDue, nextDueDay, nextReminder, type Habit } from "./habits";
import { zonedParts, zonedTimeToUtc } from "./time";

const TZ = "Asia/Jerusalem";
const every3: Habit = { repeat: { kind: "interval", every: 3, start: "2026-10-18" }, time: "18:00", nudge: true, outdoor: false };
const sunTueThu: Habit = { repeat: { kind: "weekly", days: [0, 2, 4] }, time: "07:30", nudge: false, outdoor: false };

describe("schedule", () => {
  it("interval: every 3 days from the start date only", () => {
    expect(["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-21", "2026-10-24"].map((d) => isDue(every3, d))).toEqual([false, true, false, true, true]);
  });

  it("weekly: on chosen weekdays", () => {
    // 2026-10-18 is a Sunday
    expect(isDue(sunTueThu, "2026-10-18")).toBe(true);
    expect(isDue(sunTueThu, "2026-10-19")).toBe(false);
    expect(nextDueDay(sunTueThu, "2026-10-19")).toBe("2026-10-20");
  });

  it("monthly: day of month, every N months, clamped to short months", () => {
    const rent: Habit = { repeat: { kind: "monthly", day: 1, every: 1, start: "2026-10-01" }, time: "09:00", nudge: true, outdoor: false };
    expect(isDue(rent, "2026-11-01")).toBe(true);
    expect(isDue(rent, "2026-11-02")).toBe(false);
    expect(isDue(rent, "2026-09-01")).toBe(false); // before start
    const arnona: Habit = { repeat: { kind: "monthly", day: 31, every: 2, start: "2026-10-01" }, time: "09:00", nudge: true, outdoor: false };
    expect(nextDueDay(arnona, "2026-11-01")).toBe("2026-12-31"); // November is skipped (every 2 months)
    const feb: Habit = { repeat: { kind: "monthly", day: 31, every: 1, start: "2027-01-01" }, time: "09:00", nudge: true, outdoor: false };
    expect(nextDueDay(feb, "2027-02-01")).toBe("2027-02-28"); // clamped
  });

  it("day math crosses month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("nextReminder", () => {
  const notDone = () => false;

  it("fires at the session time on the next due day", () => {
    const after = zonedTimeToUtc(2026, 10, 18, 9, 0, TZ);
    const r = nextReminder(every3, after, TZ, notDone)!;
    expect(r.kind).toBe("main");
    expect(zonedParts(r.at, TZ)).toMatchObject({ day: 18, hour: 18, minute: 0 });
  });

  it("nudges at 20:00 when the session isn't done yet", () => {
    const after = zonedTimeToUtc(2026, 10, 18, 18, 30, TZ);
    const r = nextReminder(every3, after, TZ, notDone)!;
    expect(r.kind).toBe("nudge");
    expect(zonedParts(r.at, TZ)).toMatchObject({ day: 18, hour: 20 });
  });

  it("skips today entirely once checked in", () => {
    const after = zonedTimeToUtc(2026, 10, 18, 9, 0, TZ);
    const r = nextReminder(every3, after, TZ, (d) => d === "2026-10-18")!;
    expect(r.day).toBe("2026-10-21");
  });

  it("no nudge when disabled", () => {
    const after = zonedTimeToUtc(2026, 10, 18, 8, 0, TZ);
    expect(nextReminder(sunTueThu, after, TZ, notDone)!.day).toBe("2026-10-20");
  });
});

describe("habitStats", () => {
  const done = (...days: string[]) => days.map((day) => ({ day, status: "done" as const }));

  it("counts consecutive due sessions and ignores non-due days", () => {
    const s = habitStats(every3, done("2026-10-18", "2026-10-21", "2026-10-24"), "2026-10-25");
    expect(s).toMatchObject({ streak: 3, best: 3, total: 3, dueToday: false });
    expect(s.nextDue).toBe("2026-10-27");
  });

  it("today not done yet doesn't break the streak; a missed day does", () => {
    expect(habitStats(every3, done("2026-10-18", "2026-10-21"), "2026-10-24").streak).toBe(2);
    expect(habitStats(every3, done("2026-10-18", "2026-10-21"), "2026-10-27").streak).toBe(0);
  });

  it("skipped acts as a streak freeze", () => {
    const checkins = [...done("2026-10-18"), { day: "2026-10-21", status: "skipped" as const }, ...done("2026-10-24")];
    expect(habitStats(every3, checkins, "2026-10-24").streak).toBe(2);
  });

  it("best streak survives a break; rate covers the last 30 days", () => {
    const s = habitStats(every3, done("2026-10-18", "2026-10-21", "2026-10-24", "2026-10-30"), "2026-10-30");
    expect(s.streak).toBe(1);
    expect(s.best).toBe(3);
    expect(s.rate).toBe(80); // 4 of 5 due days (18, 21, 24, 27, 30)
  });

  it("without a schedule, every day counts", () => {
    expect(habitStats(null, done("2026-10-23", "2026-10-24"), "2026-10-25").streak).toBe(2);
  });
});

describe("heatmap", () => {
  it("marks done, missed and upcoming days", () => {
    const cells = heatmap(every3, [{ day: "2026-10-18", status: "done" }], "2026-10-22", 2);
    const at = (d: string) => cells.find((c) => c.day === d)?.state;
    expect(cells).toHaveLength(14);
    expect(at("2026-10-18")).toBe("done");
    expect(at("2026-10-21")).toBe("missed");
    expect(at("2026-10-24")).toBe("due");
    expect(at("2026-10-19")).toBe("rest");
  });
});

describe("assigneesFor", () => {
  const base: Habit = { repeat: { kind: "interval", every: 1, start: "2026-10-18" }, time: "07:00", nudge: false, outdoor: true };
  it("falls back to the legacy owner when unassigned", () => {
    expect(assigneesFor(base, "2026-10-18", ["a", "b"], "a")).toEqual(["a"]);
  });
  it("person / both", () => {
    expect(assigneesFor({ ...base, assign: { kind: "person", userId: "b" } }, "2026-10-18", ["a", "b"], "a")).toEqual(["b"]);
    expect(assigneesFor({ ...base, assign: { kind: "both" } }, "2026-10-18", ["a", "b"], "a")).toEqual(["a", "b"]);
  });
  it("alternates day by day, also before the start date", () => {
    const alt: Habit = { ...base, assign: { kind: "alternate", users: ["a", "b"], start: "2026-10-18" } };
    expect(["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"].map((d) => assigneesFor(alt, d, ["a", "b"], null)[0])).toEqual(["b", "a", "b", "a"]);
  });
});
