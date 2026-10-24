"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { Mail, RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { Button, Spinner } from "@/components/ui";
import { disconnectGmail } from "@/app/actions";
import { diffDays, todayKey } from "@/lib/engine/habits";
import { monthlyCost, type Currency } from "@/lib/subs/parse";
import { readSub, type SubProps } from "@/lib/subs/types";
import { relativeDay } from "./DatesView";
import { RemoveBadge, SwipeRow } from "./SwipeRow";
import type { Item, Section } from "@/lib/db-types";
import { fill } from "@/i18n";

export interface GmailStatus {
  email: string | null;
  status: "ok" | "expired";
  lastScanAt: string | null;
}

export function money(locale: string, amount: number, currency: Currency) {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}

function ago(locale: string, iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (mins < 60) return rtf.format(-mins, "minute");
  if (mins < 48 * 60) return rtf.format(-Math.round(mins / 60), "hour");
  return rtf.format(-Math.round(mins / 1440), "day");
}

/** Sums per currency ("₪284 + $20"); there's no exchange rate here. */
function totals(locale: string, subs: SubProps[], months: number) {
  const by = new Map<Currency, number>();
  for (const s of subs) if (s.amount !== null) by.set(s.currency, (by.get(s.currency) ?? 0) + monthlyCost(s.amount, s.cycle) * months);
  return [...by].sort((a, b) => b[1] - a[1]).map(([c, v]) => money(locale, Math.round(v), c)).join(" + ") || money(locale, 0, "ILS");
}

/**
 * Subscriptions: the monthly total, then what you pay for sorted by the next
 * renewal. Gmail finds them; anything can also be added by hand.
 */
export function SubscriptionsView({
  section,
  items,
  gmail,
  timeZone,
  editing,
  onOpen,
  onDelete,
  onReload,
}: {
  section: Section;
  items: Item[];
  gmail: GmailStatus | null;
  timeZone: string;
  editing: boolean;
  onOpen: (item: Item) => void;
  onDelete: (id: string) => void;
  onReload: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const today = todayKey(timeZone);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [show, setShow] = useState<"cancelled" | "hidden" | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const flash = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 5000);
  };

  // Back from Google: say how it went, then drop ?gmail= from the URL.
  const result = params.get("gmail");
  useEffect(() => {
    if (!result) return;
    const text: Record<string, string> = {
      connected: t.subs.resultConnected,
      setup: t.subs.resultSetup,
      noscope: t.subs.resultNoscope,
      cancelled: t.subs.resultCancelled,
      expired: t.subs.expired,
      apidisabled: t.subs.resultApiDisabled,
    };
    flash(text[result] ?? t.subs.resultFailed);
    router.replace(`/sections/${section.id}`, { scroll: false });
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const subs = useMemo(() => items.map((item) => ({ item, sub: readSub(item.props) })).filter((x): x is { item: Item; sub: SubProps } => !!x.sub), [items]);
  const active = subs.filter((x) => x.sub.status === "active").sort((a, b) => (a.sub.next ?? "9").localeCompare(b.sub.next ?? "9"));
  const cancelled = subs.filter((x) => x.sub.status === "cancelled");
  const hidden = subs.filter((x) => x.sub.status === "hidden");

  async function scan() {
    setScanning(true);
    try {
      const r = (await (await fetch("/api/google/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId: section.id }) })).json()) as { ok: boolean; found?: number; added?: number; error?: string };
      await onReload();
      if (r.ok) flash(fill(t.subs.scanned, { found: String(r.found ?? 0), added: String(r.added ?? 0) }));
      else if (r.error === "expired") router.refresh();
      else flash(t.subs.resultFailed);
    } catch {
      flash(t.subs.resultFailed);
    } finally {
      setScanning(false);
    }
  }

  const connectHref = `/api/google/connect?section=${section.id}`;

  const row = ({ item, sub }: { item: Item; sub: SubProps }) => {
    const n = sub.next ? diffDays(today, sub.next) : null;
    return (
      <div key={item.id} className="flex items-center gap-2">
        <AnimatePresence>{editing && <RemoveBadge onClick={() => onDelete(item.id)} />}</AnimatePresence>
        <SwipeRow onDelete={() => onDelete(item.id)} className="min-w-0 flex-1 rounded-3xl">
          <button onClick={() => onOpen(item)} className="glass flex w-full items-center gap-3 rounded-3xl p-3 text-start">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-2xl">{sub.icon}</span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate font-bold", sub.status !== "active" && "text-muted line-through")}>{item.title}</span>
              <span className={cn("block truncate text-xs", sub.chargedAfterCancel ? "font-bold text-danger" : sub.stale ? "text-warn" : n !== null && n <= 3 && sub.status === "active" ? "font-semibold text-accent" : "text-muted")}>
                {sub.chargedAfterCancel
                  ? t.subs.chargedAgain
                  : sub.stale && sub.last
                    ? fill(t.subs.stale, { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${sub.last}T12:00:00Z`)) })
                    : sub.status === "active" && sub.next
                      ? `${sub.remind ? "🔔 " : ""}${fill(t.subs.renews, { when: relativeDay(t, today, sub.next).toLowerCase() })}`
                      : sub.source === "gmail"
                        ? `📧 ${t.subs.fromGmail}`
                        : ""}
              </span>
            </span>
            <span className="shrink-0 text-end">
              {sub.amount !== null ? (
                <>
                  <span className="block font-extrabold tabular-nums">{money(locale, sub.amount, sub.currency)}</span>
                  <span className="block text-[11px] font-semibold text-muted">{t.subs.cycleShort[sub.cycle]}</span>
                </>
              ) : (
                <span className="text-sm font-semibold text-accent">{t.subs.noPrice}</span>
              )}
            </span>
          </button>
        </SwipeRow>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Gmail */}
      {!gmail ? (
        <div className="glass space-y-3 rounded-3xl p-4">
          <div className="flex gap-3">
            <Mail className="size-6 shrink-0 text-accent" />
            <p className="text-sm text-muted">{t.subs.connectHint}</p>
          </div>
          <a href={connectHref} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-accent-fg active:scale-[0.98]">
            <Mail className="size-5" /> {t.subs.connect}
          </a>
        </div>
      ) : gmail.status === "expired" ? (
        <div className="flex items-center gap-3 rounded-3xl bg-warn/15 p-4">
          <p className="min-w-0 flex-1 text-sm font-semibold">{t.subs.expired}</p>
          <a href={connectHref} className="shrink-0 rounded-full bg-warn px-4 py-2 text-sm font-bold text-[#3a2600]">
            {t.subs.reconnect}
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-1">
          <Mail className="size-5 shrink-0 text-muted" />
          <p className="min-w-0 flex-1 text-xs text-muted">
            <span className="block truncate font-semibold">{fill(t.subs.connectedAs, { email: gmail.email ?? "" })}</span>
            {scanning ? t.subs.scanning : gmail.lastScanAt ? fill(t.subs.checked, { when: ago(locale, gmail.lastScanAt) }) : t.subs.never}
          </p>
          <Button size="sm" variant="soft" onClick={scan} disabled={scanning}>
            {scanning ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />} {t.subs.scanNow}
          </Button>
        </div>
      )}
      {gmail && (
        <button
          onClick={async () => {
            if (!confirmDisconnect) return setConfirmDisconnect(true);
            await disconnectGmail(section.id);
            setConfirmDisconnect(false);
            flash(t.subs.disconnected);
            router.refresh();
          }}
          className="-mt-2 px-1 text-xs font-semibold text-muted underline"
        >
          {confirmDisconnect ? fill(t.subs.disconnectConfirm, { email: gmail.email ?? "" }) : t.subs.disconnect}
        </button>
      )}

      {/* Totals */}
      {active.length > 0 && (
        <div className="glass rounded-3xl p-5 text-center">
          <p className="text-[34px] font-extrabold leading-none tracking-tight tabular-nums">{totals(locale, active.map((x) => x.sub), 1)}</p>
          <p className="mt-1 text-sm font-semibold text-muted">{t.subs.perMonth}</p>
          <p className="mt-3 text-xs text-muted">
            {fill(t.subs.perYear, { amount: totals(locale, active.map((x) => x.sub), 12) })} · {fill(t.subs.active, { n: String(active.length) })}
          </p>
        </div>
      )}

      {active.length ? <div className="space-y-2">{active.map(row)}</div> : <p className="glass rounded-3xl px-4 py-8 text-center text-sm text-muted">{t.subs.empty}</p>}

      {(
        [
          ["cancelled", cancelled, t.subs.cancelled],
          ["hidden", hidden, t.subs.hidden],
        ] as const
      ).map(
        ([key, list, label]) =>
          list.length > 0 && (
            <div key={key}>
              <button onClick={() => setShow((s) => (s === key ? null : key))} className="px-1 text-sm font-semibold text-muted">
                {label} ({list.length}) {show === key ? "▴" : "▾"}
              </button>
              {show === key && <div className="mt-2 space-y-2 opacity-70">{list.map(row)}</div>}
            </div>
          ),
      )}

      {toast && (
        <div onClick={() => setToast(null)} className="fixed inset-x-4 top-[max(env(safe-area-inset-top),1rem)] z-50 mx-auto max-w-md rounded-2xl bg-fg px-4 py-3 text-sm font-semibold text-bg shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
