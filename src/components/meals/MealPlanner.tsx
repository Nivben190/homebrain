"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { planMeal, saveIngredients, shopForPlan } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Button, Card, Select, Sheet, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toaster";

type Recipe = { id: string; title: string; ingredients: string[] };

export function MealPlanner({ days, recipes, plan: initial }: { days: string[]; recipes: Recipe[]; plan: Record<string, string> }) {
  const { t, locale } = useI18n();
  const m = t.meals;
  const router = useRouter();
  const toast = useToast();
  const [plan, setPlan] = useState(initial);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

  if (recipes.length === 0) return <Card className="py-8 text-center text-muted">{m.noRecipes}</Card>;

  async function pick(day: string, id: string) {
    setPlan((p) => {
      const next = { ...p };
      if (id) next[day] = id;
      else delete next[day];
      return next;
    });
    const res = await planMeal(day, id || null);
    if (!res.ok) toast.error(res.error);
  }

  async function shop() {
    setBusy(true);
    const res = await shopForPlan(days[0], days[days.length - 1]);
    setBusy(false);
    if (!res.ok) return toast.error(res.error === "no list" ? m.noList : res.error);
    toast.success(res.data.added.length ? fill(m.added, { n: res.data.added.length }) : m.nothingMissing);
  }

  return (
    <>
      <div className="space-y-2">
        {days.map((day) => {
          const r = recipes.find((x) => x.id === plan[day]);
          return (
            <Card key={day} className="space-y-2">
              <p className="text-sm font-bold text-muted">{fmt.format(new Date(`${day}T12:00:00Z`))}</p>
              <Select aria-label={fmt.format(new Date(`${day}T12:00:00Z`))} value={plan[day] ?? ""} onChange={(e) => pick(day, e.target.value)}>
                <option value="">{m.none}</option>
                {recipes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </Select>
              {r && (
                <button
                  onClick={() => {
                    setEditing(r);
                    setText(r.ingredients.join("\n"));
                  }}
                  className="text-start text-sm text-muted"
                >
                  {r.ingredients.length ? `🧂 ${r.ingredients.join(", ")}` : `✏️ ${m.addIngredients}`}
                </button>
              )}
            </Card>
          );
        })}
      </div>
      <Button className="mt-4 w-full" size="lg" loading={busy} onClick={shop}>
        <ShoppingCart className="size-5" /> {m.shop}
      </Button>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `🧂 ${editing.title}` : ""}>
        <div className="space-y-3 pb-4">
          <p className="text-sm text-muted">{m.ingredientsHint}</p>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            className="w-full"
            onClick={async () => {
              if (!editing) return;
              const res = await saveIngredients(editing.id, text);
              if (!res.ok) return toast.error(res.error);
              setEditing(null);
              router.refresh();
            }}
          >
            {t.common.save}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
