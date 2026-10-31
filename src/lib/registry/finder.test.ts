import { describe, expect, it } from "vitest";
import { FINDER_GOALS, MAX_RECOMMENDATIONS, recommend } from "./finder";
import { LIVE_TEMPLATES, SECTION_TEMPLATES } from "./templates";

const keys = (r: ReturnType<typeof recommend>) => r.map((x) => x.template.key);

describe("space finder", () => {
  it("only points at templates that are still offered", () => {
    const all = new Set(LIVE_TEMPLATES.map((t) => t.key));
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
    expect(r.filter((x) => x.suggested).map((x) => x.template.key).sort()).toEqual(["cleaning", "groceries"]);
  });

  it("skips what the home already has, and ticks the next best", () => {
    const r = recommend(["dog"], ["dog-care"]);
    expect(keys(r)[0]).toBe("dog-health");
    expect(r[0].suggested).toBe(true);
  });

  it("retired templates stay known for old spaces but are never offered", () => {
    const retired = SECTION_TEMPLATES.filter((t) => t.retired);
    expect(LIVE_TEMPLATES).toHaveLength(SECTION_TEMPLATES.length - retired.length);
    for (const t of retired) expect(LIVE_TEMPLATES).not.toContain(t);
    const everyPick = recommend(FINDER_GOALS.map((g) => g.key), []).map((r) => r.template);
    expect(everyPick.filter((t) => t.retired)).toEqual([]);
  });

  it("money leads with the one Bills & subscriptions space", () => {
    const r = recommend(["money"]);
    expect(r[0].template.key).toBe("subscriptions");
    expect(r[0].template.title.en).toBe("Bills & subscriptions");
    expect(keys(r)).not.toContain("bills");
    expect(keys(r)).not.toContain("renewals");
  });

  it("no template names a real person", () => {
    const text = JSON.stringify(SECTION_TEMPLATES);
    expect(text).not.toMatch(/Naomi|נעמי|Niv|ניב/);
  });

  it("the car goal leads to the Car space", () => {
    expect(keys(recommend(["car"]))[0]).toBe("car");
  });

  it("the move goal starts with the Moving checklist", () => {
    expect(keys(recommend(["move"]))[0]).toBe("moving");
  });

  it("keeps the list short and ignores unknown goals", () => {
    expect(recommend(FINDER_GOALS.map((g) => g.key))).toHaveLength(MAX_RECOMMENDATIONS);
    expect(recommend(["nope"])).toEqual([]);
  });
});
