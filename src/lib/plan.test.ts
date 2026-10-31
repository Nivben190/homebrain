import { describe, expect, it } from "vitest";
import { addDays, weekdayOf } from "./engine/habits";
import { zonedTimeToUtc } from "./engine/time";
import { daysLeft, isReviewWeek, lastDay, lastLog, moveSession, normalizePlan, spreadTopics, studyWeeks, weeksUntil, moveTargets, nextPlanReminder, planFromPreset, PLAN_PRESETS, planProgress, sessionOn, setSessionDays, stepHistory, weekOf, weekTarget, weekView, type PlanCheckin, type PlanSpec } from "./plan";

const TZ = "Asia/Jerusalem";
const SUN = "2026-11-01";
const at = (day: string, time: string) => zonedTimeToUtc(+day.slice(0, 4), +day.slice(5, 7), +day.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5), TZ);

// Push on Sunday, Pull on Tuesday, Legs on Thursday; 3 a week for 2 weeks.
function gym(over: Partial<PlanSpec> = {}): PlanSpec {
  return {
    start: SUN,
    from: SUN,
    weeks: 2,
    perWeek: 3,
    time: "18:30",
    nudge: true,
    sessions: [
      { id: "push", name: "Push", days: [0], steps: [{ id: "bench", name: "Bench", sets: 3, reps: 8, amount: 40, unit: "kg" }] },
      { id: "pull", name: "Pull", days: [2], steps: [] },
      { id: "legs", name: "Legs", days: [4], steps: [] },
    ],
    moves: [],
    reviewed: {},
    topics: [],
    reviewLast: false,
    stake: "Dishes for a week",
    ...over,
  };
}
const done = (day: string, data?: unknown): PlanCheckin => ({ day, status: "done", data });

describe("plan calendar", () => {
  it("weeks start on Sunday; sessions fall on their weekdays inside the plan only", () => {
    expect(weekdayOf(SUN)).toBe(0);
    expect(weekOf("2026-11-05")).toBe(SUN);
    const spec = gym();
    expect(sessionOn(spec, SUN)?.id).toBe("push");
    expect(sessionOn(spec, "2026-11-03")?.id).toBe("pull");
    expect(sessionOn(spec, "2026-11-02")).toBeNull();
    expect(sessionOn(spec, "2026-11-15")).toBeNull(); // after the 2 weeks
  });

  it("a plan made midweek only asks for the sessions still ahead that first week", () => {
    const spec = gym({ from: "2026-11-03" });
    expect(weekTarget(spec, SUN)).toBe(2);
    expect(weekTarget(spec, "2026-11-08")).toBe(3);
    expect(sessionOn(spec, SUN)).toBeNull();
  });

  it("this week: done, extra, missed, today; kept once the target is reached", () => {
    const spec = gym();
    const today = "2026-11-12"; // Thursday of week 2
    const rows = [done("2026-11-08"), done("2026-11-09")];
    const w = weekView(spec, rows, "2026-11-08", today);
    expect(w.days.map((d) => d.state)).toEqual(["done", "extra", "missed", "rest", "today", "rest", "rest"]);
    expect([w.number, w.done, w.target, w.result]).toEqual([2, 2, 3, null]);
    expect(weekView(spec, [...rows, done(today)], "2026-11-08", today).result).toBe("kept");
    // A week that ended short is missed.
    expect(weekView(spec, [done(SUN)], SUN, today).result).toBe("missed");
  });

  it("a missed session moves to a free day later that week; reminders follow it", () => {
    const spec = gym();
    const today = "2026-11-04"; // Wednesday; Tuesday's Pull was missed
    const targets = moveTargets(spec, [done(SUN)], "2026-11-03", today);
    expect(targets).toEqual(["2026-11-04", "2026-11-06", "2026-11-07"]);
    const moved = moveSession(spec, "2026-11-03", "2026-11-06")!;
    expect(sessionOn(moved, "2026-11-03")).toBeNull();
    expect(sessionOn(moved, "2026-11-06")?.id).toBe("pull");
    // Moving it again replaces the move instead of stacking.
    const again = moveSession(moved, "2026-11-06", "2026-11-07")!;
    expect(again.moves).toEqual([{ session: "pull", from: "2026-11-03", to: "2026-11-07" }]);
    // Not into another week, nor onto a planned day.
    expect(moveSession(spec, "2026-11-03", "2026-11-10")).toBeNull();
    expect(moveSession(spec, "2026-11-03", "2026-11-05")).toBeNull();
    const next = nextPlanReminder(moved, [done(SUN)], at(today, "08:00"), TZ)!;
    expect(next).toMatchObject({ kind: "main", day: "2026-11-05" });
  });

  it("each weekday belongs to one session", () => {
    const spec = setSessionDays(gym(), "pull", [2, 4]);
    expect(spec.sessions.map((s) => s.days)).toEqual([[0], [2, 4], []]);
  });
});

describe("plan reminders", () => {
  it("session time, then the evening nudge, then Saturday's look back", () => {
    const spec = gym();
    expect(nextPlanReminder(spec, [], at(SUN, "08:00"), TZ)).toMatchObject({ kind: "main", day: SUN, at: at(SUN, "18:30") });
    expect(nextPlanReminder(spec, [], at(SUN, "19:00"), TZ)).toMatchObject({ kind: "nudge", day: SUN, at: at(SUN, "20:00") });
    // Logged today: the next one is Tuesday's.
    expect(nextPlanReminder(spec, [done(SUN)], at(SUN, "19:00"), TZ)).toMatchObject({ kind: "main", day: "2026-11-03" });
    // Week kept early (an extra session): no more session reminders, only the look back.
    const kept = [done(SUN), done("2026-11-02"), done("2026-11-03")];
    expect(nextPlanReminder(spec, kept, at("2026-11-04", "08:00"), TZ)).toMatchObject({ kind: "review", day: "2026-11-07", at: at("2026-11-07", "21:00") });
    // A reviewed last week and a settled plan say nothing more.
    expect(nextPlanReminder({ ...spec, reviewed: { [SUN]: 3, "2026-11-08": 3 } }, [], at("2026-11-13", "22:00"), TZ)).toBeNull();
    expect(nextPlanReminder({ ...spec, result: "kept" }, [], at(SUN, "08:00"), TZ)).toBeNull();
  });
});

describe("plan progress", () => {
  it("weeks kept, a streak, and the result once it's over (75% of weeks)", () => {
    const spec = gym();
    const rows = [done(SUN), done("2026-11-03"), done("2026-11-05"), done("2026-11-08")];
    const mid = planProgress(spec, rows, "2026-11-10");
    expect([mid.kept, mid.missed, mid.streak, mid.over, mid.result, mid.current.number]).toEqual([1, 0, 1, false, null, 2]);
    const end = planProgress(spec, rows, "2026-11-20");
    expect([end.kept, end.missed, end.over, end.result]).toEqual([1, 1, true, "broken"]);
    const all = planProgress(spec, [...rows, done("2026-11-10"), done("2026-11-12")], "2026-11-20");
    expect(all.result).toBe("kept");
  });

  it("a step's numbers over time, and last time's log to start from", () => {
    const log = (amount: number) => ({ session: "push", steps: [{ id: "bench", done: true, sets: 3, reps: 8, amount }] });
    const rows = [done("2026-11-08", log(42.5)), done(SUN, log(40)), { day: "2026-11-09", status: "skipped" as const }];
    expect(stepHistory(rows, "bench").map((x) => x.amount)).toEqual([40, 42.5]);
    expect(lastLog(rows, "push")?.steps[0].amount).toBe(42.5);
    expect(lastLog(rows, "push", "2026-11-08")?.steps[0].amount).toBe(40);
  });

  it("presets start this week, in the person's language", () => {
    const { title, spec } = planFromPreset(PLAN_PRESETS[0], "he", "2026-11-04");
    expect(title).toBe("חדר כושר 3 פעמים בשבוע");
    expect([spec.start, spec.from, spec.perWeek, spec.weeks]).toEqual([SUN, "2026-11-04", 3, 8]);
    expect(spec.sessions[0].steps[0]).toMatchObject({ name: "לחיצת חזה", unit: "ק״ג" });
    expect(addDays(spec.start, 7 * spec.weeks - 1)).toBe("2026-12-26");
  });
});

describe("plans leading up to a test", () => {
  // Test on Wednesday Nov 25: three weeks, ending Tuesday Nov 24; the last one is for review.
  const exam = (over: Partial<PlanSpec> = {}) =>
    normalizePlan(gym({ deadline: "2026-11-25", reviewLast: true, sessions: [{ id: "study", name: "Study", days: [0, 1, 2, 3, 4], steps: [] }], perWeek: 2, ...over }));
  const covered = (day: string, topics: string[]) => done(day, { session: "study", steps: [], topics });

  it("the weeks follow the date; the plan ends the day before; the last week is for review", () => {
    const spec = exam();
    expect([spec.weeks, lastDay(spec), weeksUntil(SUN, "2026-11-25")]).toEqual([4, "2026-11-24", 4]);
    expect(daysLeft(spec, "2026-11-20")).toBe(5);
    expect(isReviewWeek(spec, "2026-11-22")).toBe(true);
    expect(studyWeeks(spec)).toEqual([SUN, "2026-11-08", "2026-11-15"]);
    // The short last week asks only for what's still planned in it (Sun–Tue).
    expect(weekTarget(spec, "2026-11-22")).toBe(2);
    expect(sessionOn(spec, "2026-11-25")).toBeNull();
    // Its look back comes on the last day, not Saturday.
    expect(nextPlanReminder({ ...spec, reviewed: { [SUN]: 2, "2026-11-08": 2, "2026-11-15": 2 } }, [done("2026-11-22"), done("2026-11-23")], at("2026-11-23", "22:00"), TZ)).toMatchObject({ kind: "review", day: "2026-11-24" });
  });

  it("pasted topics spread over the study weeks, in order", () => {
    const topics = spreadTopics(exam(), ["Ch 1", "Ch 2", "Ch 3", "Ch 4", "Ch 5", " ", "Ch 6"]);
    expect(topics.map((x) => [x.name, x.week])).toEqual([
      ["Ch 1", SUN],
      ["Ch 2", SUN],
      ["Ch 3", "2026-11-08"],
      ["Ch 4", "2026-11-08"],
      ["Ch 5", "2026-11-15"],
      ["Ch 6", "2026-11-15"],
    ]);
  });

  it("a week is kept only with its topics covered; what's left carries into the next week", () => {
    const spec = exam({ topics: [{ id: "a", name: "Ch 1", week: SUN }, { id: "b", name: "Ch 2", week: SUN }, { id: "c", name: "Ch 3", week: "2026-11-08" }] });
    const rows = [covered(SUN, ["a"]), covered("2026-11-02", [])];
    const w1 = weekView(spec, rows, SUN, "2026-11-10");
    expect([w1.done, w1.target, w1.topics.ownDone, w1.result]).toEqual([2, 2, 1, "missed"]);
    const w2 = weekView(spec, rows, "2026-11-08", "2026-11-10");
    expect(w2.topics.carried.map((x) => x.id)).toEqual(["b"]);
    expect(w2.topics.own.map((x) => x.id)).toEqual(["c"]);
    // Covering both this week keeps it; the carried one doesn't count against it.
    const more = [...rows, covered("2026-11-08", ["c"]), covered("2026-11-09", ["b"])];
    expect(weekView(spec, more, "2026-11-08", "2026-11-10").result).toBe("kept");
    expect(planProgress(spec, more, "2026-11-10").topics).toEqual({ covered: 3, revised: 0, total: 3 });
    // Session reminders don't stop while a topic is still open, even with the sessions done.
    expect(nextPlanReminder(spec, rows.slice(0, 1).concat(covered("2026-11-02", [])), at("2026-11-03", "08:00"), TZ)).toMatchObject({ kind: "main", day: "2026-11-03" });
  });

  it("topics outside a shorter plan move into it", () => {
    const spec = normalizePlan({ ...exam(), deadline: "2026-11-10", topics: [{ id: "x", name: "Late", week: "2026-11-22" }] });
    expect([spec.weeks, spec.topics[0].week]).toEqual([2, "2026-11-08"]);
  });
});
