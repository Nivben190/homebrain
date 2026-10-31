import { describe, expect, it } from "vitest";
import { snoozeChoices, snoozeUntil } from "./snooze";

const TZ = "Asia/Jerusalem";
// 10:15 in Israel (UTC+2 in November).
const morning = new Date("2026-11-03T08:15:00Z");

describe("snooze", () => {
  it("an hour, tonight at 20:00, or tomorrow at 08:00, in the home's time", () => {
    expect(snoozeUntil("hour", morning, TZ).toISOString()).toBe("2026-11-03T09:15:00.000Z");
    expect(snoozeUntil("tonight", morning, TZ).toISOString()).toBe("2026-11-03T18:00:00.000Z");
    expect(snoozeUntil("tomorrow", morning, TZ).toISOString()).toBe("2026-11-04T06:00:00.000Z");
  });

  it("no 'tonight' once the evening is here", () => {
    expect(snoozeChoices(morning, TZ)).toEqual(["hour", "tonight", "tomorrow"]);
    expect(snoozeChoices(new Date("2026-11-03T17:30:00Z"), TZ)).toEqual(["hour", "tomorrow"]);
  });
});
