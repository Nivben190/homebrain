import { describe, expect, it } from "vitest";
import { buildMonth, monthlyShare, settleUp } from "./money";
import { manualSub } from "./subs/types";
import type { Tx } from "./spend";

const tx = (amount: number, category: Tx["category"], payer: string, at = "2026-10-12T10:00:00Z", refund = false) => ({ amount, currency: "₪", merchant: "x", at, category, refund, key: String(Math.random()), payer });

describe("household money", () => {
  it("counts a yearly subscription as a twelfth, and nothing unpriced or foreign", () => {
    expect(monthlyShare({ ...manualSub("ILS"), amount: 120, cycle: "yearly" })).toBe(10);
    expect(monthlyShare({ ...manualSub("ILS"), amount: null })).toBe(0);
    expect(monthlyShare({ ...manualSub("USD"), amount: 10 })).toBe(0);
  });

  it("adds spending, subscriptions and bills into one month with budgets", () => {
    const m = buildMonth({
      month: "2026-10",
      timeZone: "Asia/Jerusalem",
      txs: [tx(300, "groceries", "a"), tx(100, "groceries", "b"), tx(50, "groceries", "b", "2026-09-30T10:00:00Z"), tx(20, "groceries", "a", "2026-10-13T10:00:00Z", true)],
      subs: [{ ...manualSub("ILS"), amount: 40 }],
      bills: [{ amount: 500, payer: "a" }],
      budgets: { groceries: 350 },
    });
    expect(m.total).toBe(380 + 40 + 500);
    expect(m.byCategory[0]).toEqual({ category: "bills", amount: 500, budget: null });
    expect(m.byCategory.find((c) => c.category === "groceries")).toEqual({ category: "groceries", amount: 380, budget: 350 });
    expect(m.paidBy).toEqual({ a: 780, b: 100 });
  });

  it("settles up so everyone carries an equal share", () => {
    expect(settleUp({ a: 780, b: 100 }, ["a", "b"])).toEqual([{ from: "b", to: "a", amount: 340 }]);
    expect(settleUp({ a: 300 }, ["a", "b", "c"])).toEqual([
      { from: "b", to: "a", amount: 100 },
      { from: "c", to: "a", amount: 100 },
    ]);
    expect(settleUp({ a: 10, b: 10 }, ["a", "b"])).toEqual([]);
  });
});
