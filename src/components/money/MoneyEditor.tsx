"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBillAmount, setBudget } from "@/app/actions";
import { CATEGORIES } from "@/lib/spend";
import { useI18n } from "@/i18n/client";
import { Card, Input, SectionTitle } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { errorKey } from "@/lib/errors";

const ALL = [...CATEGORIES.filter((c) => c !== "subscriptions" && c !== "bills"), "subscriptions", "bills"];

/** Bill amounts and (for those who run the home) monthly budgets, saved on blur when changed. */
export function MoneyEditor({ bills, budgets, categories, canBudget }: { bills: { id: string; title: string; amount: number | null }[]; budgets: Record<string, number>; categories: string[]; canBudget: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [shown, setShown] = useState(() => [...new Set([...categories, ...Object.keys(budgets)])]);
  const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Number(s)));
  /** Saves a box's value unless it's what was there already; a refusal puts the old value back. */
  const save = async (box: HTMLInputElement, write: (n: number | null) => Promise<{ ok: boolean; error?: string }>) => {
    const was = num(box.defaultValue);
    const value = num(box.value);
    if (value === was) return;
    const res = await write(value);
    if (!res.ok) {
      box.value = box.defaultValue;
      return toast.error(t.failures[errorKey(res.error)]);
    }
    box.defaultValue = value === null ? "" : String(value);
    toast.success(t.settings.saved);
    router.refresh();
  };

  return (
    <>
      {bills.length > 0 && (
        <>
          <SectionTitle>🧾 {t.money.billAmounts}</SectionTitle>
          <Card className="space-y-2">
            {bills.map((b) => (
              <label key={b.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate">{b.title}</span>
                <Input type="number" inputMode="decimal" min={0} defaultValue={b.amount ?? ""} placeholder="₪" onBlur={(e) => save(e.currentTarget, (n) => setBillAmount(b.id, n))} className="h-10 w-28 text-end" />
              </label>
            ))}
          </Card>
        </>
      )}
      {canBudget && (
        <>
          <SectionTitle>🎯 {t.money.budgets}</SectionTitle>
          <Card className="space-y-2">
            {shown.map((c) => (
              <label key={c} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate">{t.spend.categories[c] ?? c}</span>
                <Input type="number" inputMode="decimal" min={0} defaultValue={budgets[c] ?? ""} placeholder="₪" onBlur={(e) => save(e.currentTarget, (n) => setBudget(c, n))} className="h-10 w-28 text-end" />
              </label>
            ))}
            <select aria-label={t.money.addBudget} value="" onChange={(e) => e.target.value && setShown((s) => [...s, e.target.value])} className="h-10 w-full rounded-2xl bg-sunken px-3 text-sm font-semibold">
              <option value="">+ {t.money.addBudget}</option>
              {ALL.filter((c) => !shown.includes(c)).map((c) => (
                <option key={c} value={c}>
                  {t.spend.categories[c] ?? c}
                </option>
              ))}
            </select>
          </Card>
        </>
      )}
    </>
  );
}
