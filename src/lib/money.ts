// Household money (roadmap 3.6): one monthly picture from Spending, Subscriptions
// and the Bills tracker, with budgets and a settle-up between members. Shekels only;
// other currencies stay in their own spaces.
import { summarizeMonth, signed, type Tx } from "@/lib/spend";
import type { SubProps } from "@/lib/subs/types";

/** An amount on a bill (tracker item), set on the Money screen. */
export const AMOUNT_PROP = "_amount";

export interface MoneyInput {
  month: string;
  timeZone: string;
  /** Purchases, with who forwarded them. */
  txs: (Tx & { payer: string | null })[];
  subs: SubProps[];
  /** Bills due this month: amount and who pays (assignee), if known. */
  bills: { amount: number; payer: string | null }[];
  budgets: Record<string, number>;
}

export interface MoneyMonth {
  total: number;
  byCategory: { category: string; amount: number; budget: number | null }[];
  paidBy: Record<string, number>;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A subscription's share of one month in ₪, or 0 when unpriced, cancelled or in another currency. */
export function monthlyShare(s: SubProps) {
  if (s.status !== "active" || !s.amount || s.currency !== "ILS") return 0;
  return s.cycle === "yearly" ? s.amount / 12 : s.amount;
}

export function buildMonth(input: MoneyInput): MoneyMonth {
  const spend = summarizeMonth(input.txs, input.month, input.timeZone);
  const subs = round(input.subs.reduce((sum, s) => sum + monthlyShare(s), 0));
  const bills = round(input.bills.reduce((sum, b) => sum + b.amount, 0));
  const rows = [...spend.byCategory, { category: "subscriptions", amount: subs }, { category: "bills", amount: bills }].filter((r) => r.amount > 0);
  const paidBy: Record<string, number> = {};
  const add = (who: string | null, n: number) => {
    if (who) paidBy[who] = round((paidBy[who] ?? 0) + n);
  };
  const inMonth = input.txs.filter((t) => t.currency === "₪" && t.at.slice(0, 7) === input.month);
  for (const t of inMonth) add(t.payer, signed(t));
  for (const b of input.bills) add(b.payer, b.amount);
  return {
    total: round(spend.total + subs + bills),
    byCategory: rows.sort((a, b) => b.amount - a.amount).map((r) => ({ ...r, budget: input.budgets[r.category] ?? null })),
    paidBy,
  };
}

/** Who pays whom so everyone carries an equal share; fewest transfers, largest first. */
export function settleUp(paid: Record<string, number>, members: string[]): { from: string; to: string; amount: number }[] {
  if (members.length < 2) return [];
  const total = members.reduce((s, m) => s + (paid[m] ?? 0), 0);
  const share = total / members.length;
  const owe = members.map((m) => ({ m, d: (paid[m] ?? 0) - share }));
  const creditors = owe.filter((x) => x.d > 0.005).sort((a, b) => b.d - a.d);
  const debtors = owe.filter((x) => x.d < -0.005).sort((a, b) => a.d - b.d);
  const out: { from: string; to: string; amount: number }[] = [];
  for (const debtor of debtors) {
    let left = -debtor.d;
    for (const c of creditors) {
      if (left < 0.005) break;
      const pay = Math.min(left, c.d);
      if (pay < 0.005) continue;
      out.push({ from: debtor.m, to: c.m, amount: round(pay) });
      c.d -= pay;
      left -= pay;
    }
  }
  return out;
}
