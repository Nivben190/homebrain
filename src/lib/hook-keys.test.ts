import { describe, expect, it } from "vitest";
import { hashKey, legacyAccepted, newKey, presentedToken, signLaunch, verifyLaunch } from "./hook-keys";

const secret = "test-secret";
const user = "6f1c2c1e-0000-4000-8000-000000000001";
const now = new Date("2026-10-29T10:00:00Z");

describe("hook keys", () => {
  it("makes long random keys and hashes them the same way every time", () => {
    const a = newKey();
    expect(a).toMatch(/^hb_[A-Za-z0-9_-]{43}$/);
    expect(newKey()).not.toBe(a);
    expect(hashKey(a)).toBe(hashKey(a));
    expect(hashKey(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prefers the x-brain-token header over the query string", () => {
    const req = new Request("https://x.test/api/hooks/event?token=from-query", { headers: { "x-brain-token": "from-header" } });
    expect(presentedToken(req)).toBe("from-header");
    expect(presentedToken(new Request("https://x.test/api/hooks/event?token=q"))).toBe("q");
    expect(presentedToken(new Request("https://x.test/api/hooks/event"))).toBeNull();
  });

  it("accepts the old shared token only until the cutoff", () => {
    expect(legacyAccepted(new Date("2026-11-11T23:00:00Z"))).toBe(true);
    expect(legacyAccepted(new Date("2026-11-13T00:00:00Z"))).toBe(false);
  });
});

describe("launch tokens", () => {
  it("round-trips the user for the purpose it was signed for", () => {
    const token = signLaunch(user, "notes", secret, now);
    expect(verifyLaunch(token, "notes", secret, now)).toBe(user);
  });

  it("rejects another purpose, a wrong secret, a tampered user and an expired token", () => {
    const token = signLaunch(user, "notes", secret, now);
    expect(verifyLaunch(token, "capture", secret, now)).toBeNull();
    expect(verifyLaunch(token, "notes", "other", now)).toBeNull();
    expect(verifyLaunch(token.replace(user, user.replace("1", "2")), "notes", secret, now)).toBeNull();
    expect(verifyLaunch(token, "notes", secret, new Date(now.getTime() + 2 * 86400_000))).toBeNull();
    expect(verifyLaunch("hb_not-a-launch-token", "notes", secret, now)).toBeNull();
  });
});
