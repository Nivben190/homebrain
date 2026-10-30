"use client";
import { useEffect, useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button, Field, Input, Segmented, Select, Sheet, Toggle } from "@/components/ui";
import { todayKey } from "@/lib/engine/habits";
import type { Currency, Cycle } from "@/lib/subs/parse";
import { readSub, RENEW_AHEAD, subPatch, type SubProps } from "@/lib/subs/types";
import { money } from "./SubscriptionsView";
import type { CheckinRow, Item, Section } from "@/lib/db-types";
import { fill } from "@/i18n";

const CURRENCIES: Currency[] = ["ILS", "USD", "EUR", "GBP"];

export function SubscriptionSheet({
  item,
  section,
  checkins,
  timeZone,
  gmailEmail,
  onClose,
  onChange,
  onDelete,
}: {
  item: Item | null;
  section: Section;
  checkins: CheckinRow[];
  timeZone: string;
  gmailEmail: string | null;
  onClose: () => void;
  onChange: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [title, setTitle] = useState("");
  const [sub, setSub] = useState<SubProps | null>(null);
  const [price, setPrice] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!item) return;
    const s = readSub(item.props);
    setTitle(item.title);
    setSub(s);
    setPrice(s?.amount != null ? String(s.amount) : "");
    setDirty(false);
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item || !sub) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const handled = new Set(checkins.filter((c) => c.status === "done").map((c) => c.day));
  const parsed = price.trim() ? Number(price.replace(",", ".")) : null;
  // Every save carries the price box too, so a toggle doesn't drop a typed price.
  const commit = (next: SubProps) => {
    const final = { ...next, amount: parsed === null ? null : Number.isFinite(parsed) ? parsed : next.amount };
    onChange(item.id, { title: title.trim() || item.title, ...subPatch(item.props, final, timeZone, handled) });
    setSub(final);
    setDirty(false);
  };
  // Price, cycle and date edits stick: later Gmail scans won't overwrite them.
  const edit = (patch: Partial<SubProps>) => {
    setSub({ ...sub, ...patch, edited: true });
    setDirty(true);
  };
  const cancelUrl = sub.cancel ?? `https://www.google.com/search?q=${encodeURIComponent(fill(t.subs.howToCancel, { name: item.title }))}`;

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${section.icon} ${section.title}`}
      footer={
        <div className="flex gap-2">
          {dirty && (
            <Button size="lg" className="flex-1" onClick={() => commit(sub)}>
              {t.common.saveChanges}
            </Button>
          )}
          {sub.source === "manual" ? (
            <Button size="lg" variant="danger" className={dirty ? "" : "flex-1"} onClick={() => onDelete(item.id)} aria-label={t.common.delete}>
              <Trash2 className="size-5" /> {dirty ? "" : t.common.delete}
            </Button>
          ) : (
            <Button size="lg" variant="ghost" className={dirty ? "" : "flex-1"} onClick={() => commit({ ...sub, status: sub.status === "hidden" ? "active" : "hidden" })}>
              {sub.status === "hidden" ? t.subs.unhide : t.subs.hide}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-sunken text-3xl">{sub.icon}</span>
          <Input value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} className="h-14 text-lg font-bold" />
        </div>

        {sub.chargedAfterCancel && <p className="rounded-2xl bg-danger/12 p-3 text-sm font-bold text-danger">{t.subs.chargedAgain}</p>}

        {/* Cancel */}
        {sub.status !== "hidden" && (
          <div className="space-y-2 rounded-2xl bg-sunken p-3">
            {sub.status === "active" ? (
              <>
                <a href={cancelUrl} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-danger font-bold text-white active:scale-[0.98]">
                  {t.subs.cancelIt} <ExternalLink className="size-4" />
                </a>
                <p className="px-1 text-xs text-muted">{t.subs.cancelHint}</p>
                <Button variant="soft" className="w-full" onClick={() => commit({ ...sub, status: "cancelled", cancelledOn: todayKey(timeZone), chargedAfterCancel: false })}>
                  ✓ {t.subs.markCancelled}
                </Button>
              </>
            ) : (
              <Button variant="soft" className="w-full" onClick={() => commit({ ...sub, status: "active", chargedAfterCancel: false })}>
                ↺ {t.subs.markActive}
              </Button>
            )}
          </div>
        )}

        <Field label={t.subs.price}>
          <div className="flex gap-2">
            <Input inputMode="decimal" aria-label={t.subs.price} value={price} placeholder="0" onChange={(e) => (setPrice(e.target.value), edit({}))} className="h-12 flex-1 text-lg font-bold tabular-nums" />
            <Select value={sub.currency} onChange={(e) => edit({ currency: e.target.value as Currency })} className="h-12 w-28">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {money(locale, 0, c).replace(/[\d.,\s]/g, "")} {c}
                </option>
              ))}
            </Select>
          </div>
        </Field>
        <Field label={t.subs.cycle}>
          <Segmented
            value={sub.cycle}
            onChange={(cycle: Cycle) => edit({ cycle })}
            options={[
              { value: "monthly", label: t.subs.monthly },
              { value: "yearly", label: t.subs.yearly },
              { value: "weekly", label: t.subs.weekly },
            ]}
          />
        </Field>
        <Field label={t.subs.next}>
          <Input type="date" value={sub.next ?? ""} onChange={(e) => edit({ next: e.target.value || null })} className="h-12" />
        </Field>
        {sub.cycle !== "weekly" && (
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-sunken px-4 py-3">
            <span className="text-sm font-medium">🔔 {fill(t.subs.remind, { n: String(RENEW_AHEAD) })}</span>
            <Toggle checked={sub.remind} onChange={(remind) => commit({ ...sub, remind })} />
          </label>
        )}

        {!!sub.charges?.length && (
          <Field label={`📧 ${t.subs.emails}`}>
            <ul className="divide-y divide-card-border overflow-hidden rounded-2xl bg-sunken">
              {sub.charges.map((c) => (
                <li key={c.id}>
                  <a
                    href={`https://mail.google.com/mail/u/${encodeURIComponent(gmailEmail ?? "0")}/#all/${c.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.subject}</span>
                      <span className="block text-xs text-muted">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${c.day}T12:00:00Z`))}</span>
                    </span>
                    {c.amount !== null && <span className="shrink-0 text-sm font-bold tabular-nums">{money(locale, c.amount, c.currency ?? sub.currency)}</span>}
                    <ExternalLink className="size-3.5 shrink-0 text-faint" />
                  </a>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </div>
    </Sheet>
  );
}
