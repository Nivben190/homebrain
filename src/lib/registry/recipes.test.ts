import { describe, expect, it } from "vitest";
import { automationDefSchema } from "@/lib/engine/types";
import { RECIPES } from "./recipes";

const spaces = [
  { id: "00000000-0000-4000-8000-000000000001", view: "checklist", template: "groceries" },
  { id: "00000000-0000-4000-8000-000000000002", view: "wheel", template: null },
  { id: "00000000-0000-4000-8000-000000000003", view: "subscriptions", template: null },
];

describe("Brain recipes", () => {
  for (const locale of ["en", "he"] as const) {
    it(`every recipe builds a valid automation (${locale})`, () => {
      for (const r of RECIPES) {
        const def = r.build({ locale, spaces, hasPartner: true });
        expect(def, r.id).not.toBeNull();
        expect(automationDefSchema.safeParse(def).success, r.id).toBe(true);
      }
    });
  }

  it("points the supermarket recipe at the groceries list", () => {
    const def = RECIPES.find((r) => r.id === "supermarket")!.build({ locale: "en", spaces, hasPartner: false });
    expect(def?.actions).toContainEqual(expect.objectContaining({ type: "open_section", sectionId: spaces[0].id }));
  });

  it("skips what the home can't do", () => {
    expect(RECIPES.find((r) => r.id === "love_note")!.build({ locale: "en", spaces, hasPartner: false })).toBeNull();
    expect(RECIPES.find((r) => r.id === "supermarket")!.build({ locale: "en", spaces: [], hasPartner: true })).toBeNull();
  });
});
