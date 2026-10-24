import { describe, expect, it } from "vitest";
import { allDayRange, buildIcs } from "./ics";

const TZ = "Asia/Jerusalem";

describe("all-day events", () => {
  it("falls on the local day just after midnight in summer time (UTC+3)", () => {
    const start = new Date("2026-07-14T21:30:00Z"); // 00:30 on 15 July in Israel
    expect(allDayRange({ start, end: start, timeZone: TZ })).toEqual(["20260715", "20260716"]);
  });

  it("falls on the local day just after midnight in winter time (UTC+2)", () => {
    const start = new Date("2026-12-31T22:30:00Z"); // 00:30 on 1 January in Israel
    expect(allDayRange({ start, end: start, timeZone: TZ })).toEqual(["20270101", "20270102"]);
  });

  it("leaves timed events as UTC timestamps", () => {
    const start = new Date("2026-07-14T21:30:00Z");
    const ics = buildIcs("x", [{ uid: "u", title: "t", start, end: new Date(start.getTime() + 1800000) }]);
    expect(ics).toContain("DTSTART:20260714T213000Z");
  });
});
