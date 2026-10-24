"use client";
import { useRef, useState } from "react";
import { Camera, Loader2, Star } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { cn } from "@/lib/cn";
import { fridgeProps, LEVELS, readFridge, type FridgeState, type Level } from "@/lib/fridge";
import { resizeImage } from "@/lib/photos";
import { Button } from "@/components/ui";
import { SwipeRow } from "./SwipeRow";
import type { Item, Section } from "@/lib/db-types";

const LEVEL_STYLE: Record<Level, string> = { full: "bg-success/15 text-success", half: "bg-accent-soft text-accent", low: "bg-warn/15 text-warn", out: "bg-danger/15 text-danger" };

/**
 * Smart fridge: snap the fridge, and the inventory updates itself. Starred
 * products are staples; when they run low or out they go on the shopping list.
 */
export function FridgeView({
  section,
  items,
  onUpdate,
  onDelete,
  onReload,
}: {
  section: Section;
  items: Item[];
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onDelete: (id: string) => void;
  onReload: () => void;
}) {
  const { t, locale } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const all = items.map((item) => ({ item, f: readFridge(item.props) ?? ({ level: "full", staple: false } as FridgeState) }));
  const inside = all.filter((x) => x.f.level !== "out").sort((a, b) => LEVELS.indexOf(b.f.level) - LEVELS.indexOf(a.f.level) || a.item.title.localeCompare(b.item.title));
  const out = all.filter((x) => x.f.level === "out");
  const missing = all.filter((x) => x.f.staple && (x.f.level === "low" || x.f.level === "out"));
  const save = (item: Item, f: FridgeState) => onUpdate(item.id, { props: fridgeProps(item.props, f) });
  const lastScan = section.settings?.lastScan;

  async function scan(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("image", await resizeImage(file, 1600), "fridge.jpg");
      form.append("space", section.id);
      const res = await fetch("/api/fridge/scan", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(fill(t.fridge.result, { seen: data.seen, added: data.added.length, buy: data.toBuy.length }));
      onReload();
    } catch {
      setResult(t.fridge.failed);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <div className="glass rounded-3xl p-4 text-center">
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
        <Button className="w-full" size="lg" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />} {busy ? t.fridge.scanning : t.fridge.scan}
        </Button>
        <p className="mt-2 text-xs text-muted">
          {result ?? (lastScan ? fill(t.fridge.lastScan, { when: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastScan)) }) : t.fridge.hint)}
        </p>
      </div>

      {missing.length > 0 && (
        <section className="glass space-y-1 rounded-3xl p-4">
          <h2 className="text-sm font-bold text-danger">🛒 {t.fridge.missing}</h2>
          <p className="text-sm">{missing.map((x) => x.item.title).join(" · ")}</p>
          <p className="text-xs text-muted">{t.fridge.onList}</p>
        </section>
      )}

      {all.length === 0 && <p className="glass rounded-3xl px-4 py-10 text-center text-muted">{t.fridge.empty}</p>}

      {inside.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-muted">
            {t.fridge.inside} · {inside.length}
          </h2>
          {inside.map(({ item, f }) => (
            <Row key={item.id} item={item} f={f} onSave={(n) => save(item, n)} onDelete={() => onDelete(item.id)} />
          ))}
        </section>
      )}

      {out.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-bold text-muted">{t.fridge.out}</h2>
          {out.map(({ item, f }) => (
            <Row key={item.id} item={item} f={f} onSave={(n) => save(item, n)} onDelete={() => onDelete(item.id)} />
          ))}
        </section>
      )}
    </div>
  );
}

function Row({ item, f, onSave, onDelete }: { item: Item; f: FridgeState; onSave: (f: FridgeState) => void; onDelete: () => void }) {
  const { t } = useI18n();
  // Tapping the level steps it down (full → half → low → out → full) for a quick manual fix.
  const next = LEVELS[(LEVELS.indexOf(f.level) + 1) % LEVELS.length];
  return (
    <SwipeRow onDelete={onDelete} className="rounded-3xl">
      <div className={cn("glass flex items-center gap-3 rounded-3xl px-4 py-3", f.level === "out" && "opacity-60")}>
        <span className="text-2xl">{f.emoji ?? "🥡"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.title}</p>
          {f.qty ? <p className="text-xs text-muted">× {f.qty}</p> : null}
        </div>
        <button onClick={() => onSave({ ...f, level: next })} className={cn("rounded-full px-3 py-1 text-xs font-bold", LEVEL_STYLE[f.level])}>
          {t.fridge.levels[f.level]}
        </button>
        <button onClick={() => onSave({ ...f, staple: !f.staple })} aria-label={t.fridge.staple} title={t.fridge.staple} className="p-1">
          <Star className={cn("size-5", f.staple ? "fill-warn text-warn" : "text-faint")} />
        </button>
      </div>
    </SwipeRow>
  );
}
