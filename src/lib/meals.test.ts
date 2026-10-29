import { describe, expect, it } from "vitest";
import { FRIDGE_PROP } from "./fridge";
import { parseIngredients, shoppingFor } from "./meals";

describe("meal plan to shopping list", () => {
  it("reads ingredients pasted as a list", () => expect(parseIngredients("- Pasta\n2. Tomatoes, Basil\n\n• garlic")).toEqual(["Pasta", "Tomatoes", "Basil", "garlic"]));

  it("adds each missing ingredient once", () => {
    const fridge = [
      { title: "Tomatoes", props: { [FRIDGE_PROP]: { level: "full", staple: true } } },
      { title: "Milk", props: { [FRIDGE_PROP]: { level: "out", staple: true } } },
    ];
    expect(shoppingFor(["Pasta", "Tomato", "Milk", "pasta", "Basil"], fridge, ["Basil"])).toEqual(["Pasta", "Milk"]);
  });
});
