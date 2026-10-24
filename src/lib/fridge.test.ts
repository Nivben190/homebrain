import { describe, expect, it } from "vitest";
import { FRIDGE_PROP, parseSeen, planScan, readFridge, sameProduct, toBuy, type FridgeState } from "./fridge";

const row = (id: string, title: string, f: Partial<FridgeState> = {}) => ({ id, title, props: { [FRIDGE_PROP]: { level: "full", staple: false, ...f } } });
const now = new Date("2026-10-24T10:00:00Z");

describe("sameProduct", () => {
  it("matches plurals, extra words and Hebrew", () => {
    expect(sameProduct("Eggs", "egg")).toBe(true);
    expect(sameProduct("Milk", "Milk 3%")).toBe(true);
    expect(sameProduct("חלב", "חלב 3%")).toBe(true);
    expect(sameProduct("Milk", "Almond milk")).toBe(true);
    expect(sameProduct("Butter", "Peanut butter jar")).toBe(true);
    expect(sameProduct("Cheese", "Milk")).toBe(false);
  });
});

describe("planScan", () => {
  it("updates seen products, adds new ones and marks the unseen out", () => {
    const rows = [row("m", "Milk", { staple: true }), row("e", "Eggs", { staple: true }), row("j", "Jam")];
    const plan = planScan(rows, [{ name: "milk", level: "low" }, { name: "Hummus", level: "full", emoji: "🥣" }], now);
    expect(readFridge(plan.update.find((u) => u.id === "m")!.props)).toMatchObject({ level: "low", staple: true, seen: now.toISOString() });
    expect(readFridge(plan.update.find((u) => u.id === "e")!.props)?.level).toBe("out");
    expect(readFridge(plan.update.find((u) => u.id === "j")!.props)?.level).toBe("out");
    expect(plan.insert).toEqual([{ title: "Hummus", props: { [FRIDGE_PROP]: { level: "full", emoji: "🥣", staple: false, seen: now.toISOString(), qty: undefined } } }]);
    expect(plan.missing).toEqual(["Milk", "Eggs"]);
  });
  it("leaves already-out products alone and doesn't list non-staples as missing", () => {
    const plan = planScan([row("j", "Jam", { level: "out" })], [], now);
    expect(plan).toEqual({ remove: [], update: [], insert: [], missing: [] });
  });
  it("folds duplicate rows of one product, keeping a star", () => {
    const plan = planScan([row("a", "ביצה"), row("b", "ביצה", { staple: true }), row("c", "Ketchup")], [{ name: "ביצה", level: "half" }], now);
    expect(plan.remove).toEqual(["b"]);
    expect(readFridge(plan.update.find((u) => u.id === "a")!.props)).toMatchObject({ level: "half", staple: true });
    expect(readFridge(plan.update.find((u) => u.id === "c")!.props)?.level).toBe("out");
  });
});

describe("toBuy & parseSeen", () => {
  it("skips what's already on the list", () => {
    expect(toBuy(["Milk", "Eggs"], ["milk 1L"])).toEqual(["Eggs"]);
  });
  it("reads a JSON array out of the answer and drops junk", () => {
    expect(parseSeen('Here you go:\n[{"name":"Milk","level":"half","qty":1,"emoji":"🥛"},{"name":"","level":"full"},{"name":"Eggs","level":"weird","qty":6}]')).toEqual([
      { name: "Milk", level: "half", qty: 1, emoji: "🥛" },
      { name: "Eggs", level: "full", qty: 6, emoji: undefined },
    ]);
    expect(parseSeen("no fridge here")).toEqual([]);
  });
});
