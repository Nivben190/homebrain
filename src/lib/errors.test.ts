import { describe, expect, it } from "vitest";
import { errorKey } from "./errors";

describe("errorKey", () => {
  it("names a lost connection", () => expect(errorKey(new TypeError("Failed to fetch"))).toBe("offline"));
  it("names a refused permission", () => expect(errorKey({ message: "new row violates row-level security policy" })).toBe("denied"));
  it("names a bad password", () => expect(errorKey("Invalid login credentials")).toBe("invalidLogin"));
  it("names an unconfirmed email", () => expect(errorKey("Email not confirmed")).toBe("unconfirmed"));
  it("names rate limits", () => expect(errorKey("Email rate limit exceeded")).toBe("tooMany"));
  it("names a page left over from an older deploy", () => expect(errorKey(new Error('Failed to find Server Action "7f3a". This request might be from an older or newer deployment.'))).toBe("outdated"));
  it("falls back to generic", () => expect(errorKey("weird thing")).toBe("generic"));
});
