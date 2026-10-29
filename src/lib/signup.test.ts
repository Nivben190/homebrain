import { describe, expect, it } from "vitest";
import { canSignUp, inviteState, isInviteToken } from "./signup";

describe("canSignUp", () => {
  const base = { email: "stranger@x.com", inviteValid: false, anyHome: true };
  it("refuses a stranger once a home exists", () => expect(canSignUp(base)).toBe(false));
  it("refuses a stranger even with no allow-list set", () => expect(canSignUp({ ...base, allowedEmails: "" })).toBe(false));
  it("lets in an allowed email", () => expect(canSignUp({ ...base, allowedEmails: "a@b.com, Stranger@x.com" })).toBe(true));
  it("lets in anyone with a valid invite code", () => expect(canSignUp({ ...base, inviteValid: true })).toBe(true));
  it("lets the first person in on a fresh install", () => expect(canSignUp({ ...base, anyHome: false })).toBe(true));
  it("keeps a fresh install closed when an allow-list is set", () =>
    expect(canSignUp({ ...base, anyHome: false, allowedEmails: "a@b.com" })).toBe(false));
});

describe("invite links", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  it("tells a link token from a household code", () => {
    expect(isInviteToken("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(isInviteToken("AB12CD34")).toBe(false);
  });
  it("accepts a fresh unused link", () => expect(inviteState({ used_at: null, expires_at: "2026-11-05T12:00:00Z" }, now)).toBe("ok"));
  it("refuses a used link", () => expect(inviteState({ used_at: "2026-10-28T12:00:00Z", expires_at: "2026-11-05T12:00:00Z" }, now)).toBe("used"));
  it("refuses an expired link", () => expect(inviteState({ used_at: null, expires_at: "2026-10-29T11:59:00Z" }, now)).toBe("expired"));
  it("refuses an unknown link", () => expect(inviteState(null, now)).toBe("missing"));
});
