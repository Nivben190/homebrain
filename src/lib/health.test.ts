import { describe, expect, it } from "vitest";
import { setupLight, tickHealth } from "./health";

const now = new Date("2026-10-29T10:00:00Z");

describe("tickHealth", () => {
  it("is healthy when the last tick was under three minutes ago", () => {
    expect(tickHealth({ last_tick_at: "2026-10-29T09:58:30Z", failed_phases: [] }, now)).toEqual({ ok: true, ageSeconds: 90, failedPhases: [] });
  });

  it("is unhealthy when the last tick is older than three minutes", () => {
    expect(tickHealth({ last_tick_at: "2026-10-29T09:56:59Z", failed_phases: [] }, now).ok).toBe(false);
  });

  it("is unhealthy when no tick was ever recorded", () => {
    expect(tickHealth(null, now)).toEqual({ ok: false, ageSeconds: null, failedPhases: [] });
  });

  it("stays healthy while a phase fails, but reports it", () => {
    expect(tickHealth({ last_tick_at: "2026-10-29T09:59:50Z", failed_phases: ["daily"] }, now)).toEqual({ ok: true, ageSeconds: 10, failedPhases: ["daily"] });
  });
});

describe("setupLight", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  it("is red when nothing was ever received", () => expect(setupLight(null, 2, now)).toBe("red"));
  it("is green when it reported recently", () => expect(setupLight("2026-10-29T07:12:00Z", 2, now)).toBe("green"));
  it("turns amber once it goes quiet", () => expect(setupLight("2026-10-20T07:12:00Z", 2, now)).toBe("amber"));
});
