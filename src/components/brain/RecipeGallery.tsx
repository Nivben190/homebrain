"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addRecipe } from "@/app/actions";
import { RECIPES, type RecipeId } from "@/lib/registry/recipes";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui";

/** One-tap routines (roadmap 2.7). */
export function RecipeGallery() {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<Partial<Record<RecipeId, "busy" | "added" | string>>>({});

  async function add(id: RecipeId) {
    setState((s) => ({ ...s, [id]: "busy" }));
    const res = await addRecipe(id);
    setState((s) => ({ ...s, [id]: res.ok ? "added" : res.error === "missing" ? t.brain.recipeMissing : res.error }));
    if (res.ok) router.refresh();
  }

  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
      {RECIPES.map((r) => {
        const s = state[r.id];
        return (
          <div key={r.id} className="glass flex w-60 shrink-0 snap-start flex-col gap-3 rounded-3xl p-4">
            <span className="text-3xl">{r.icon}</span>
            <p className="flex-1 text-[15px] font-medium leading-snug">{t.brain.recipe[r.id]}</p>
            {s && s !== "busy" && s !== "added" && <p className="text-xs text-warn">{s}</p>}
            <Button size="sm" variant={s === "added" ? "soft" : "primary"} loading={s === "busy"} disabled={s === "added"} onClick={() => add(r.id)}>
              {s === "added" ? t.brain.recipeAdded : t.brain.recipeAdd}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
