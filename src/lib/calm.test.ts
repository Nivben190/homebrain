import { describe, expect, it } from "vitest";
import { inQuietHours, pushAllowed } from "./calm";

describe("quiet hours", () => {
  it("is off without both ends", () => expect(inQuietHours(23 * 60, null, "07:00")).toBe(false));
  it("covers a window across midnight", () => {
    expect(inQuietHours(23 * 60, "22:00", "07:00")).toBe(true);
    expect(inQuietHours(6 * 60 + 59, "22:00", "07:00")).toBe(true);
    expect(inQuietHours(7 * 60, "22:00", "07:00")).toBe(false);
    expect(inQuietHours(12 * 60, "22:00", "07:00")).toBe(false);
  });
  it("covers a window inside one day", () => {
    expect(inQuietHours(14 * 60, "13:00:00", "15:00:00")).toBe(true);
    expect(inQuietHours(16 * 60, "13:00", "15:00")).toBe(false);
  });
});

describe("pushAllowed", () => {
  const p = { quiet_from: null, quiet_to: null, muted_sections: [] as string[], digest: false, timezone: "UTC" };
  const noon = new Date("2026-10-29T12:00:00Z");
  it("pushes by default", () => expect(pushAllowed(p, "s1", noon)).toBe(true));
  it("holds pushes from a muted space", () => expect(pushAllowed({ ...p, muted_sections: ["s1"] }, "s1", noon)).toBe(false));
  it("holds single pushes for the evening digest", () => expect(pushAllowed({ ...p, digest: true }, "s1", noon)).toBe(false));
  it("holds pushes in quiet hours, in the person's own time zone", () => {
    expect(pushAllowed({ ...p, quiet_from: "15:00", quiet_to: "16:00", timezone: "Asia/Jerusalem" }, "s1", noon)).toBe(true);
    expect(pushAllowed({ ...p, quiet_from: "14:00", quiet_to: "16:00", timezone: "Asia/Jerusalem" }, "s1", noon)).toBe(false);
  });
});
