import { describe, expect, it, vi } from "vitest";
import { allow, clientIp, LIMITS, secondsLeft, tooMany } from "./rate-limit";

function fakeDb(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { db: { rpc } as never, rpc };
}

describe("rate limits", () => {
  it("reads the caller's IP from the first x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("counts a hit in the rule's bucket and window", async () => {
    const { db, rpc } = fakeDb({ data: true, error: null });
    expect(await allow(db, "hookKey", "abc")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("hit_rate_limit", {
      p_bucket: "hookKey:abc",
      p_limit: LIMITS.hookKey.limit,
      p_window_seconds: LIMITS.hookKey.windowSeconds,
    });
  });

  it("refuses once the database says the bucket is full", async () => {
    const { db } = fakeDb({ data: false, error: null });
    expect(await allow(db, "fridgeScan", "user-1")).toBe(false);
  });

  it("lets the request through if the counter can't be reached", async () => {
    const { db } = fakeDb({ data: null, error: { message: "boom" } });
    expect(await allow(db, "signUp", "203.0.113.7")).toBe(true);
  });

  it("refuses paid fridge scans if the counter can't be reached", async () => {
    const { db } = fakeDb({ data: null, error: { message: "boom" } });
    expect(await allow(db, "fridgeScan", "user-1")).toBe(false);
  });

  it("matches the roadmap: 60 hook calls a minute, 20 fridge scans a day", () => {
    expect(LIMITS.hookKey).toEqual({ limit: 60, windowSeconds: 60 });
    expect(LIMITS.fridgeScan).toMatchObject({ limit: 20, windowSeconds: 86_400 });
  });

  it("says how long until the window turns over", () => {
    expect(secondsLeft("hookIp", new Date("2026-10-29T10:00:45Z"))).toBe(15);
    expect(secondsLeft("fridgeScan", new Date("2026-10-29T23:00:00Z"))).toBe(3600);
  });

  it("answers 429 with a Retry-After", async () => {
    const res = tooMany("hookIp", new Date("2026-10-29T10:00:20Z"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("40");
    expect(await res.json()).toMatchObject({ error: "too many requests", message: expect.stringContaining("Too many") });
  });
});
