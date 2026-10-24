import { describe, expect, it } from "vitest";
import { allowedSections, sectionRefs } from "./scope";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("sectionRefs", () => {
  it("collects create, open and random targets", () => {
    const refs = sectionRefs([
      { type: "push", title: "Hi", body: `{{random:${A}}}` },
      { type: "create_item", sectionId: B, title: "x" },
      { type: "open_section", sectionId: C },
    ]);
    expect(refs.sort()).toEqual([A, B, C].sort());
  });
});

describe("allowedSections", () => {
  const automation = { household_id: "h1", owner_id: "me" };
  it("keeps shared and own private spaces, drops foreign and partner-private ones", () => {
    const allowed = allowedSections(
      [
        { id: A, household_id: "h1", owner_id: null },
        { id: B, household_id: "h1", owner_id: "partner" },
        { id: C, household_id: "h2", owner_id: null },
        { id: "own", household_id: "h1", owner_id: "me" },
      ],
      automation,
    );
    expect([...allowed].sort()).toEqual([A, "own"].sort());
  });
});
