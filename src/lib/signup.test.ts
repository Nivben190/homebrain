import { describe, expect, it } from "vitest";
import { canSignUp } from "./signup";

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
