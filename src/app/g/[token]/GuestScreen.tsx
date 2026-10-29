"use client";
import { useState } from "react";
import { renderSVG } from "uqr";
import { Check } from "lucide-react";
import { guestTick } from "@/app/actions";
import { wifiQr, type guestView } from "@/lib/home-info";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Card, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/cn";

export function GuestScreen({
  token,
  home,
  label,
  expiresAt,
  section,
  items: initial,
  info,
}: {
  token: string;
  home: string;
  label: string;
  expiresAt: string;
  section: { title: string; icon: string; tracker: boolean } | null;
  items: { id: string; title: string; done: boolean }[];
  info: ReturnType<typeof guestView> | null;
}) {
  const { t, locale } = useI18n();
  const g = t.guest;
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function tick(id: string) {
    const before = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, done: true } : i)));
    const res = await guestTick(token, id);
    if (!res.ok) {
      setItems(before);
      setError(res.error === "expired" ? g.expired : t.failures.generic);
    }
  }

  const until = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(expiresAt));
  return (
    <main className="safe-top mx-auto max-w-md px-5 pb-16 pt-6">
      <h1 className="text-[30px] font-extrabold tracking-tight">🏠 {home}</h1>
      <p className="text-muted">{fill(g.hello, { name: label || g.guest })} · {fill(g.until, { when: until })}</p>
      {error && <p className="mt-3 rounded-2xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {section && (
        <>
          <SectionTitle>
            {section.icon} {section.title}
          </SectionTitle>
          <div className="space-y-2">
            {items.map((i) => (
              <button key={i.id} onClick={() => tick(i.id)} disabled={i.done} className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-start">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border-2", i.done ? "border-success bg-success text-white" : "border-faint-deco")}>{i.done && <Check className="size-4" />}</span>
                <span className={cn("flex-1 text-lg font-semibold", i.done && "text-muted line-through")}>{i.title}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {info && (
        <>
          {info.wifi_name && (
            <>
              <SectionTitle>📶 {t.homeInfo.wifi}</SectionTitle>
              <Card className="space-y-2 text-center">
                <div className="mx-auto w-44 rounded-2xl bg-white p-3" role="img" aria-label={t.homeInfo.wifiQr} dangerouslySetInnerHTML={{ __html: renderSVG(wifiQr(info.wifi_name, info.wifi_password ?? null)) }} />
                <p dir="ltr" className="font-mono">{info.wifi_name}{info.wifi_password ? ` · ${info.wifi_password}` : ""}</p>
              </Card>
            </>
          )}
          {info.vet?.name && (
            <>
              <SectionTitle>🐾 {t.homeInfo.vet}</SectionTitle>
              <Card className="flex items-center justify-between">
                <span className="font-semibold">{info.vet.name}</span>
                <a href={`tel:${info.vet.phone}`} className="font-semibold text-accent" dir="ltr">{info.vet.phone}</a>
              </Card>
            </>
          )}
          {!!info.contacts?.length && (
            <>
              <SectionTitle>🆘 {t.homeInfo.contacts}</SectionTitle>
              <Card className="divide-y divide-card-border p-0">
                {info.contacts.map((c, n) => (
                  <a key={n} href={`tel:${c.phone}`} className="flex items-center justify-between px-4 py-3">
                    <span className="font-semibold">{c.label}</span>
                    <span className="text-accent" dir="ltr">{c.phone}</span>
                  </a>
                ))}
              </Card>
            </>
          )}
          {info.notes && (
            <>
              <SectionTitle>📝 {t.homeInfo.notes}</SectionTitle>
              <Card className="whitespace-pre-wrap">{info.notes}</Card>
            </>
          )}
        </>
      )}
    </main>
  );
}
