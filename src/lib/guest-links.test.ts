import { describe, expect, it } from "vitest";
import { guestLinkOpen, guestMayTick, isGuestToken } from "./guest-links";

describe("guest links", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  it("is open until it expires or is revoked", () => {
    expect(guestLinkOpen({ expires_at: "2026-10-30T12:00:00Z", revoked_at: null }, now)).toBe(true);
    expect(guestLinkOpen({ expires_at: "2026-10-29T11:00:00Z", revoked_at: null }, now)).toBe(false);
    expect(guestLinkOpen({ expires_at: "2026-10-30T12:00:00Z", revoked_at: "2026-10-29T10:00:00Z" }, now)).toBe(false);
    expect(guestLinkOpen(null, now)).toBe(false);
  });
  it("lets a guest tick only in the linked space", () => {
    expect(guestMayTick({ section_id: "s1" }, { section_id: "s1" })).toBe(true);
    expect(guestMayTick({ section_id: "s1" }, { section_id: "s2" })).toBe(false);
    expect(guestMayTick({ section_id: null }, { section_id: "s1" })).toBe(false);
  });
  it("checks the token shape before any lookup", () => {
    expect(isGuestToken("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isGuestToken("../etc")).toBe(false);
  });
});
