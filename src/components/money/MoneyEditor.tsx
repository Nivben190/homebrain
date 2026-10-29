"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBillAmount, setBudget } from "@/app/actions";
import { CATEGORIES } from "@/lib/spend";
import { useI18n } from "@/i18n/client";
import { Card, Input, SectionTitle } from "@/components/ui";
import { useToast } from "@/components/Toaster";

const ALL = [...CATEGORIES.filter((c) => c !== "subscriptions" && c !== "bills"), "subscriptions", "bills"];

/** Bill amounts and monthly budgets, saved on blur. */
export function MoneyEditor({ bills, budgets, categories }: { bills: { id: string; title: string; amount: number | null }[]; budgets: Record<string, number>; categories: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [shown, setShown] = useState(() => [...new Set([...categories, ...Object.keys(budgets)])]);
  const done = (res: { ok: boolean; error?: string }) => {
    if (!res.ok) return toast.error(res.error ?? "");
    toast.success(t.settings.saved);
    router.refresh();
  };
  const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Number(s)));

  return (
    <>
      {bills.length > 0 && (
        <>
          <SectionTitle>🧾 {t.money.billAmounts}</SectionTitle>
          <Card className="space-y-2">
            {bills.map((b) => (
              <label key={b.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate">{b.title}</span>
                <Input type="number" inputMode="decimal" min={0} defaultValue={b.amount ?? ""} placeholder="₪" onBlur={async (e) => done(await setBillAmount(b.id, num(e.target.value)))} className="h-10 w-28 text-end" />
              </label>
            ))}
          </Card>
        </>
      )}
      <SectionTitle>🎯 {t.money.budgets}</SectionTitle>
      <Card className="space-y-2">
        {shown.map((c) => (
          <label key={c} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate">{t.spend.categories[c] ?? c}</span>
            <Input type="number" inputMode="decimal" min={0} defaultValue={budgets[c] ?? ""} placeholder="₪" onBlur={async (e) => done(await setBudget(c, num(e.target.value)))} className="h-10 w-28 text-end" />
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
  );
}
