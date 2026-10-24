// What a subscription item stores (items.props._sub), shared by the Gmail scan
// and the Subscriptions space. Renewal alerts reuse the reminder calendar:
// with `remind` on, the item also gets a `_dates` spec for its next renewal.
import { DATES_PROP, datePlan, type DateSpec } from "@/lib/engine/dates";
import type { Currency, Cycle } from "./parse";

export const SUB_PROP = "_sub";
/** Days before a renewal to send the heads-up. */
export const RENEW_AHEAD = 3;

export interface SubCharge {
  id: string;
  day: string;
  amount: number | null;
  currency: Currency | null;
  subject: string;
}

export interface SubProps {
  /** Detection key (gmail); null for ones added by hand. */
  key: string | null;
  source: "gmail" | "manual";
  status: "active" | "cancelled" | "hidden";
  amount: number | null;
  currency: Currency;
  cycle: Cycle;
  next: string | null;
  last: string | null;
  cancel: string | null;
  icon: string;
  remind: boolean;
  /** The user changed price/cycle/date: later scans keep their values. */
  edited?: boolean;
  stale?: boolean;
  cancelledOn?: string | null;
  chargedAfterCancel?: boolean;
  charges?: SubCharge[];
}

export function readSub(props: Record<string, unknown>): SubProps | null {
  const s = props[SUB_PROP];
  return s && typeof s === "object" ? (s as SubProps) : null;
}

export function manualSub(currency: Currency = "ILS"): SubProps {
  return { key: null, source: "manual", status: "active", amount: null, currency, cycle: "monthly", next: null, last: null, cancel: null, icon: "💳", remind: false };
}

/** Item fields for a subscription: its props plus the renewal alert schedule. */
export function subPatch(props: Record<string, unknown>, sub: SubProps, timeZone: string, handled: Set<string>, now = new Date()) {
  const { [DATES_PROP]: _old, ...rest } = props; // eslint-disable-line @typescript-eslint/no-unused-vars
  const alerting = sub.remind && sub.status === "active" && !!sub.next && sub.cycle !== "weekly";
  if (!alerting) return { props: { ...rest, [SUB_PROP]: sub }, remind_at: null, due_at: null };
  const spec: DateSpec = { date: sub.next!, repeat: sub.cycle === "yearly" ? "yearly" : "monthly", from: "09:00", until: "21:00", every: 0, ahead: RENEW_AHEAD, carry: false };
  const plan = datePlan(spec, now, timeZone, (d) => handled.has(d));
  return { props: { ...rest, [SUB_PROP]: sub, [DATES_PROP]: spec }, remind_at: plan.remindAt?.toISOString() ?? null, due_at: plan.dueAt?.toISOString() ?? null };
}
