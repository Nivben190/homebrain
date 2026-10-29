import { describe, expect, it } from "vitest";
import { expiryStage } from "./expiry";

describe("expiryStage", () => {
  const today = "2026-10-29";
  it("is quiet far ahead", () => expect(expiryStage("2027-03-01", today, null)).toBeNull());
  it("warns at 60 days", () => expect(expiryStage("2026-12-28", today, null)).toBe(60));
  it("doesn't repeat a stage already sent for this date", () => expect(expiryStage("2026-12-28", today, { for: "2026-12-28", sent: [60] })).toBeNull());
  it("moves to 30 and 7 days", () => {
    expect(expiryStage("2026-11-20", today, { for: "2026-11-20", sent: [60] })).toBe(30);
    expect(expiryStage("2026-11-03", today, { for: "2026-11-03", sent: [60, 30] })).toBe(7);
  });
  it("sends only the nearest stage when several were missed", () => expect(expiryStage("2026-11-03", today, null)).toBe(7));
  it("starts over when the date is renewed", () => expect(expiryStage("2026-12-28", today, { for: "2026-11-01", sent: [60, 30, 7] })).toBe(60));
  it("stops once expired", () => expect(expiryStage("2026-10-28", today, null)).toBeNull());
});
