// Meal plan to shopping list (roadmap 3.5).
import { readFridge, sameProduct, toBuy } from "@/lib/fridge";

/** Ingredients live on the recipe item, one per line, in an internal prop any recipe space can carry. */
export const INGREDIENTS_PROP = "_ingredients";

export function readIngredients(props: Record<string, unknown>): string[] {
  const v = props[INGREDIENTS_PROP];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
}

export const parseIngredients = (text: string) =>
  text
    .split(/\r?\n|,/)
    .map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 60);

/**
 * What to add to Groceries for the planned recipes: every ingredient once,
 * minus what the Fridge still has (anything not low or out), minus what's
 * already on the list.
 */
export function shoppingFor(ingredients: string[], fridge: { title: string; props: Record<string, unknown> }[], onList: string[]): string[] {
  const unique: string[] = [];
  for (const i of ingredients) if (!unique.some((u) => sameProduct(u, i))) unique.push(i);
  const stocked = fridge.filter((f) => {
    const s = readFridge(f.props);
    return !s || (s.level !== "low" && s.level !== "out");
  });
  return toBuy(
    unique.filter((i) => !stocked.some((f) => sameProduct(f.title, i))),
    onList,
  );
}
