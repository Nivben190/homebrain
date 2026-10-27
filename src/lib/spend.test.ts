import { describe, expect, it } from "vitest";
import { categorize, matchesCommit, parseSpendSms, pickSpendSpace, recurringCharges, spendKey, summarizeMonth, type Tx } from "./spend";

describe("parseSpendSms", () => {
  it("reads a Max purchase in Hebrew", () => {
    expect(parseSpendSms('מקס: בכרטיסך המסתיים ב-1234 אושרה עסקה בסך 84.90 ש"ח בשופרסל דיל.')).toMatchObject({ amount: 84.9, currency: "₪", card: "1234", merchant: "שופרסל דיל", refund: false });
  });
  it("reads a Leumi charge with ₪ and a merchant after בית העסק", () => {
    expect(parseSpendSms("לאומי: חיוב בכרטיס 5678 בסך ₪1,250.00 בבית העסק: איקאה נתניה")).toMatchObject({ amount: 1250, card: "5678", merchant: "איקאה נתניה" });
  });
  it("reads English alerts and dollars", () => {
    expect(parseSpendSms("Max: a transaction of $12.99 at NETFLIX.COM was approved on your card ending 4321")).toMatchObject({ amount: 12.99, currency: "$", merchant: "NETFLIX.COM", card: "4321" });
  });
  it("marks refunds", () => {
    expect(parseSpendSms('זיכוי בסך 50 ש"ח בכרטיס 1234 מזארה')?.refund).toBe(true);
  });
  it("ignores codes and texts without an amount", () => {
    expect(parseSpendSms("קוד האימות שלך הוא 123456")).toBeNull();
    expect(parseSpendSms("Your Max verification code is 4455, 20 ₪")).toBeNull();
    expect(parseSpendSms("שלום, החשבונית החודשית זמינה באתר")).toBeNull();
  });
});

describe("categorize", () => {
  it("knows common Israeli merchants", () => {
    expect(categorize("שופרסל דיל")).toBe("groceries");
    expect(categorize("PAZ YELLOW")).toBe("fuel");
    expect(categorize("NETFLIX.COM")).toBe("subscriptions");
    expect(categorize("CIBUS PLUXEE")).toBe("eating");
    expect(categorize("משהו אחר")).toBe("other");
  });
});

describe("routing & dedupe", () => {
  const spaces = [
    { id: "home", owner_id: null, settings: { cards: ["1234"] } },
    { id: "mine", owner_id: "u1", settings: { cards: ["5678"] } },
  ];
  it("sends a card to the space that lists it, else the shared one", () => {
    expect(pickSpendSpace(spaces, "5678")?.id).toBe("mine");
    expect(pickSpendSpace(spaces, "9999")?.id).toBe("home");
    expect(pickSpendSpace(spaces, undefined)?.id).toBe("home");
  });
  it("gives the same text the same key", () => {
    expect(spendKey("a  b")).toBe(spendKey("a b"));
    expect(spendKey("a")).not.toBe(spendKey("b"));
  });
});

describe("summaries & commitments", () => {
  const tx = (amount: number, at: string, category: Tx["category"], refund = false): Tx => ({ amount, currency: "₪", merchant: "x", at, category, refund, key: at });
  it("totals a month by category, minus refunds", () => {
    const s = summarizeMonth([tx(100, "2026-10-02T10:00:00Z", "groceries"), tx(40, "2026-10-03T10:00:00Z", "groceries", true), tx(60, "2026-10-05T10:00:00Z", "fuel"), tx(999, "2026-09-30T10:00:00Z", "fuel")], "2026-10", "Asia/Jerusalem");
    expect(s.total).toBe(120);
    expect(s.byCategory).toEqual([{ category: "fuel", amount: 60 }, { category: "groceries", amount: 60 }]);
  });
  it("matches a limit commitment by a word in its title", () => {
    expect(matchesCommit("עד 300 שקל בסיבוס החודש", "CIBUS PLUXEE")).toBe(true);
    expect(matchesCommit("No more than 300 shekel on Cibus this month", "סיבוס")).toBe(true);
    expect(matchesCommit("under 500 on Wolt", "WOLT TLV")).toBe(true);
    expect(matchesCommit("under 500 on Wolt", "שופרסל")).toBe(false);
  });
});

describe("recurringCharges", () => {
  const tx = (merchant: string, amount: number, at: string, refund = false): Tx => ({ amount, currency: "₪", merchant, at, category: "other", refund, key: at + merchant });
  it("finds a merchant charging about the same each month", () => {
    const r = recurringCharges([tx("DISNEY PLUS", 39.9, "2026-08-14T09:00:00Z"), tx("Disney Plus", 39.9, "2026-09-14T09:00:00Z"), tx("שופרסל", 230, "2026-09-02T09:00:00Z"), tx("שופרסל", 410, "2026-10-01T09:00:00Z")]);
    expect(r).toEqual([{ key: "card:disney plus", merchant: "Disney Plus", amount: 39.9, currency: "₪", last: "2026-09-14", next: "2026-10-14" }]);
  });
  it("needs a monthly rhythm and steady price", () => {
    expect(recurringCharges([tx("GYM", 200, "2026-09-01T00:00:00Z"), tx("GYM", 200, "2026-09-08T00:00:00Z")])).toEqual([]);
    expect(recurringCharges([tx("AUDIBLE", 60, "2026-09-01T00:00:00Z")])).toEqual([]);
  });
});
