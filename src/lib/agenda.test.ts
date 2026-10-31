import { describe, expect, it } from "vitest";
import { buildAgenda, type AgendaSources } from "./agenda";

const empty: AgendaSources = { items: [], sessions: [], automations: [], holidays: [], google: [], members: ["a", "b"] };

describe("buildAgenda", () => {
  it("has a list for every day of the week, even empty ones", () => {
    const week = buildAgenda("2026-11-01", 7, empty);
    expect([...week.keys()]).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
  });

  it("expands sessions onto their days with who's on them", () => {
    const week = buildAgenda("2026-11-01", 7, {
      ...empty,
      sessions: [{ id: "w", title: "Walk", icon: "🐕", sectionId: "s", fallback: "a", habit: { repeat: { kind: "weekly", days: [1, 3] }, time: "19:00", nudge: true, outdoor: true, assign: { kind: "both" } } }],
    });
    expect(week.get("2026-11-02")).toEqual([expect.objectContaining({ title: "Walk", time: "19:00", who: ["a", "b"] })]);
    expect(week.get("2026-11-04")).toHaveLength(1);
    expect(week.get("2026-11-03")).toEqual([]);
  });

  it("shows what was done, by whom, with its note, also on a day it wasn't planned", () => {
    const week = buildAgenda("2026-11-01", 7, {
      ...empty,
      sessions: [
        {
          id: "s",
          title: "Shower",
          icon: "🚿",
          sectionId: "x",
          fallback: "a",
          habit: { repeat: { kind: "weekly", days: [1] }, time: "08:00", nudge: false, outdoor: false },
          checkins: [
            { day: "2026-11-02", status: "done", note: "Cold water only", user_id: "b" },
            { day: "2026-11-05", status: "done", note: null, user_id: "a" },
          ],
        },
      ],
    });
    expect(week.get("2026-11-02")).toEqual([expect.objectContaining({ title: "Shower", status: "done", note: "Cold water only", who: ["b"] })]);
    expect(week.get("2026-11-05")).toEqual([expect.objectContaining({ status: "done", who: ["a"] })]);
  });

  it("puts all-day things first, then by time, and drops what falls outside", () => {
    const week = buildAgenda("2026-11-01", 7, {
      ...empty,
      items: [
        { id: "1", title: "Dentist", icon: "🦷", sectionId: "s", day: "2026-11-03", time: "10:00", who: "a" },
        { id: "2", title: "Too late", icon: "x", sectionId: "s", day: "2026-11-09", time: null, who: null },
      ],
      google: [{ day: "2026-11-03", time: "08:30", title: "Standup", who: "b" }],
      holidays: [{ day: "2026-11-03", title: "Rosh Chodesh" }],
    });
    expect(week.get("2026-11-03")!.map((e) => e.title)).toEqual(["Rosh Chodesh", "Standup", "Dentist"]);
    expect([...week.values()].flat().some((e) => e.title === "Too late")).toBe(false);
  });
});
