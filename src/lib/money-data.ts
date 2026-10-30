import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readTx } from "@/lib/spend";
import { readSub } from "@/lib/subs/types";
import { isDue, readHabit } from "@/lib/engine/habits";
import { AMOUNT_PROP, buildMonth } from "@/lib/money";

type Row = { id: string; title: string; props: Record<string, unknown>; created_by: string | null; assignee_id: string | null; sections: { view: string; template: string | null; household_id: string } };

/** Loads one home's month from its Spending, Subscriptions and Bills spaces (roadmap 3.6). */
export async function loadMonth(db: SupabaseClient, householdId: string, month: string, timeZone: string) {
  // Purchases are many, so only those added around this month (a text arrives within days of the purchase);
  // subscriptions and bills are few and recur, so all of them.
  const [y0, m0] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y0, m0 - 1, 1) - 7 * 86_400_000).toISOString();
  const to = new Date(Date.UTC(y0, m0, 1) + 31 * 86_400_000).toISOString();
  const cols = "id,title,props,created_by,assignee_id,sections!inner(view,template,household_id)";
  const [{ data: spend }, { data: recurring }, { data: budgets }] = await Promise.all([
    db.from("items").select(cols).eq("sections.household_id", householdId).eq("sections.view", "spend").gte("created_at", from).lt("created_at", to).limit(5000).returns<Row[]>(),
    db.from("items").select(cols).eq("sections.household_id", householdId).or("view.eq.subscriptions,template.eq.bills", { referencedTable: "sections" }).returns<Row[]>(),
    db.from("money_budgets").select("category,amount").eq("household_id", householdId),
  ]);
  const all = [...(spend ?? []), ...(recurring ?? [])];
  const [y, m] = month.split("-").map(Number);
  const days = Array.from({ length: new Date(Date.UTC(y, m, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);

  const txs = all.flatMap((r) => {
    const tx = r.sections.view === "spend" ? readTx(r.props) : null;
    return tx ? [{ ...tx, payer: r.created_by }] : [];
  });
  const subs = all.flatMap((r) => {
    const s = r.sections.view === "subscriptions" ? readSub(r.props) : null;
    return s ? [s] : [];
  });
  const billRows = all.filter((r) => r.sections.template === "bills");
  const bills = billRows.flatMap((r) => {
    const habit = readHabit(r.props);
    const amount = Number(r.props[AMOUNT_PROP]);
    if (!habit || !amount || !days.some((d) => isDue(habit, d))) return [];
    return [{ amount, payer: r.assignee_id ?? r.created_by }];
  });

  const result = buildMonth({ month, timeZone, txs, subs, bills, budgets: Object.fromEntries((budgets ?? []).map((b) => [b.category, Number(b.amount)])) });
  return { ...result, billItems: billRows.map((r) => ({ id: r.id, title: r.title, amount: Number(r.props[AMOUNT_PROP]) || null })) };
}
