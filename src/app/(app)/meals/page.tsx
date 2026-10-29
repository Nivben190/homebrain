import { requireHome, getT } from "@/lib/session";
import { addDays, todayKey } from "@/lib/engine/habits";
import { readIngredients } from "@/lib/meals";
import { PageHeader } from "@/components/ui";
import { MealPlanner } from "@/components/meals/MealPlanner";

/** Meal plan (roadmap 3.5): dinners for the next 7 days from "Recipes we love", then one tap to shop. */
export default async function MealsPage() {
  const { supabase, profile } = await requireHome();
  const t = await getT();
  const from = todayKey(profile.timezone);
  const to = addDays(from, 6);
  const [{ data: recipes }, { data: plan }] = await Promise.all([
    supabase.from("items").select("id,title,props,sections!inner(template)").eq("sections.template", "recipes").order("title").returns<{ id: string; title: string; props: Record<string, unknown> }[]>(),
    supabase.from("meal_plan").select("day,item_id").gte("day", from).lte("day", to),
  ]);
  return (
    <>
      <PageHeader title={t.meals.title} subtitle={t.meals.subtitle} />
      <MealPlanner
        days={Array.from({ length: 7 }, (_, n) => addDays(from, n))}
        recipes={(recipes ?? []).map((r) => ({ id: r.id, title: r.title, ingredients: readIngredients(r.props) }))}
        plan={Object.fromEntries((plan ?? []).map((p) => [p.day, p.item_id]))}
      />
    </>
  );
}
