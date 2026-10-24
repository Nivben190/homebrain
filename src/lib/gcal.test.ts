import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/subs/gmail", () => ({}));
import { eventBody } from "./gcal";

describe("eventBody", () => {
  it("makes an all-day event ending the next day", () => {
    expect(eventBody({ title: "Vet", day: "2026-12-31", timeZone: "Asia/Jerusalem" })).toEqual({
      summary: "Vet",
      description: undefined,
      start: { date: "2026-12-31" },
      end: { date: "2027-01-01" },
    });
  });
  it("makes a timed event in the user's zone", () => {
    const start = new Date("2026-10-24T15:00:00Z");
    expect(eventBody({ title: "Run", start, end: new Date("2026-10-24T15:30:00Z"), timeZone: "Asia/Jerusalem" }).start).toEqual({
      dateTime: "2026-10-24T15:00:00.000Z",
      timeZone: "Asia/Jerusalem",
    });
  });
});
