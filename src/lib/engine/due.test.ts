import { describe, expect, it } from "vitest";
import { dueReminderAt, readLead } from "./due";

const now = new Date("2026-10-24T08:00:00Z");

describe("dueReminderAt", () => {
  it("schedules lead minutes before the due time", () => {
    expect(dueReminderAt("2026-10-26T06:00:00Z", 1440, now)).toBe("2026-10-25T06:00:00.000Z");
    expect(dueReminderAt("2026-10-26T06:00:00Z", 0, now)).toBe("2026-10-26T06:00:00.000Z");
  });
  it("reschedules when the date changes", () => {
    expect(dueReminderAt("2026-10-30T06:00:00Z", 60, now)).toBe("2026-10-30T05:00:00.000Z");
  });
  it("cancels when the date is cleared, the reminder is off, or the moment has passed", () => {
    expect(dueReminderAt(null, 60, now)).toBeNull();
    expect(dueReminderAt("2026-10-26T06:00:00Z", null, now)).toBeNull();
    expect(dueReminderAt("2026-10-24T08:30:00Z", 60, now)).toBeNull();
  });
});

describe("readLead", () => {
  it("reads a minute count and ignores junk", () => {
    expect(readLead({ _remind: 60 })).toBe(60);
    expect(readLead({ _remind: "x" })).toBeNull();
    expect(readLead({})).toBeNull();
  });
});
