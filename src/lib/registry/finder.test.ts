import { describe, expect, it } from "vitest";
import { FINDER_GOALS, MAX_RECOMMENDATIONS, recommend } from "./finder";
import { SECTION_TEMPLATES } from "./templates";

const keys = (r: ReturnType<typeof recommend>) => r.map((x) => x.template.key);

describe("space finder", () => {
  it("only points at templates that exist", () => {
    const all = new Set(SECTION_TEMPLATES.map((t) => t.key));
    expect(FINDER_GOALS.flatMap((g) => g.picks).filter((k) => !all.has(k))).toEqual([]);
  });

  it("one goal: its spaces in order, the best one ticked", () => {
    const r = recommend(["dog"]);
    expect(keys(r)).toEqual(["dog-care", "dog-health", "dog-training", "dog-supplies"]);
    expect(r.map((x) => x.suggested)).toEqual([true, false, false, false]);
    expect(r[0].goals.map((g) => g.key)).toEqual(["dog"]);
  });

  it("a space that serves two goals rises, and says so", () => {
    const r = recommend(["food", "house"]);
    expect(r[0].template.key).toBe("groceries");
    expect(r[0].goals.map((g) => g.key).sort()).toEqual(["food", "house"]);
    expect(r.filter((x) => x.suggested).map((x) => x.template.key).sort()).toEqual(["cleaning", "meals"]);
  });

  it("skips what the home already has, and ticks the next best", () => {
    const r = recommend(["dog"], ["dog-care"]);
    expect(keys(r)[0]).toBe("dog-health");
    expect(r[0].suggested).toBe(true);
  });

  it("keeps the list short and ignores unknown goals", () => {
    expect(recommend(FINDER_GOALS.map((g) => g.key))).toHaveLength(MAX_RECOMMENDATIONS);
    expect(recommend(["nope"])).toEqual([]);
  });
});
