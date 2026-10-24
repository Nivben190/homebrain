import { describe, expect, it } from "vitest";
import { landingRotation, pickWinner, readWheel, spinnable } from "./wheel";

const opts = [{ label: "Pizza" }, { label: "Sushi", doneDay: "2026-10-20" }, { label: "Tacos" }];

describe("wheel", () => {
  it("reads saved options and drops empty labels", () => {
    expect(readWheel({ _wheel: { options: [{ label: "A" }, { label: " " }], last: "A" } })).toEqual({ options: [{ label: "A" }], last: "A" });
    expect(readWheel({})).toEqual({ options: [], last: undefined });
  });

  it("rests options marked done recently, but never leaves the wheel empty", () => {
    expect(spinnable(opts, "2026-10-24")).toEqual([0, 2]);
    expect(spinnable(opts, "2026-12-01")).toEqual([0, 1, 2]);
    expect(spinnable([{ label: "x", doneDay: "2026-10-24" }], "2026-10-24")).toEqual([0]);
  });

  it("picks from the spinnable pool", () => {
    expect(pickWinner(opts, "2026-10-24", 0)).toBe(0);
    expect(pickWinner(opts, "2026-10-24", 0.99)).toBe(2);
    expect(pickWinner([], "2026-10-24")).toBe(-1);
  });

  it("lands the winner's slice under the top pointer", () => {
    for (const winner of [0, 1, 3]) {
      const r = landingRotation(123, winner, 4);
      expect(r).toBeGreaterThan(123 + 4 * 360);
      // The point of the wheel now at the top, measured clockwise from the wheel's own top.
      const atTop = (360 - (r % 360)) % 360;
      expect(Math.floor(atTop / 90)).toBe(winner);
    }
  });
});
