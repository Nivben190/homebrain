import { describe, expect, it } from "vitest";
import { routeCapture } from "./capture";

const spaces = [
  { id: "house", title: "🏠 House to-do", template: "house", view: "checklist" },
  { id: "buy", title: "To buy", template: "groceries", view: "checklist" },
  { id: "wheel", title: "Spin the wheel", template: "wheels", view: "wheel" },
];

describe("routeCapture", () => {
  it("uses the space the Shortcut picked, by id or name", () => {
    expect(routeCapture("call plumber", spaces, "house").space?.id).toBe("house");
    expect(routeCapture("call plumber", spaces, "to buy").space?.id).toBe("buy");
  });
  it("understands 'X to <space>' in English and Hebrew", () => {
    expect(routeCapture("fix the door to house to-do", spaces)).toEqual({ space: spaces[0], text: "fix the door" });
    expect(routeCapture("נורות לקניות", [...spaces, { id: "k", title: "קניות", template: null, view: "list" }]).space?.id).toBe("k");
  });
  it("sends food words to the groceries list", () => {
    expect(routeCapture("milk", spaces).space?.id).toBe("buy");
    expect(routeCapture("חלב", spaces).space?.id).toBe("buy");
  });
  it("sends commitments to the Commitments space in both languages", () => {
    const withCommit = [...spaces, { id: "c", title: "Commitments", template: "commitments", view: "commit" }];
    expect(routeCapture("I commit to laundry today", withCommit).space?.id).toBe("c");
    expect(routeCapture("אני מתחייב לא יותר מ-300 שקל בסיבוס החודש", withCommit).space?.id).toBe("c");
  });

  it("falls back to the first list, never a wheel", () => {
    expect(routeCapture("add batteries", spaces)).toEqual({ space: spaces[0], text: "batteries" });
    expect(routeCapture("x", [spaces[2]]).space).toBeNull();
  });
});
