"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MessageCircle, Pencil, Phone, Trash2 } from "lucide-react";
import { deletePet, logPetWeight, newFoodBag, reorderFood } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { Button, Card, IconButton, IconTile, Input, SectionTitle, Sheet } from "@/components/ui";
import { addDays, diffDays } from "@/lib/engine/habits";
import { bagDays, foodDaysLeft } from "@/lib/engine/food";
import { normalizePhone } from "@/lib/engine/render";
import { PetForm } from "./PetForm";
import type { Pet, PetWeight } from "@/lib/db-types";

export interface PetRoutine {
  id: string;
  title: string;
  icon: string;
  color: string;
  open: string[];
  doneToday: number;
  tracker: boolean;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

/** Tiny SVG line chart for weight history. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 280;
  const h = 64;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 6 - ((v - min) / span) * (h - 12)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-16 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function age(birthday: string, today: string, t: { years: string; months: string }) {
  const months = Math.floor(diffDays(birthday, today) / 30.44);
  return months >= 12 ? fill(t.years, { n: Math.floor(months / 12) }) : fill(t.months, { n: Math.max(0, months) });
}

export function PetScreen({ pet, weights, routines, today }: { pet: Pet; weights: PetWeight[]; routines: PetRoutine[]; today: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [kg, setKg] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const left = foodDaysLeft(pet, today);
  const total = bagDays(pet);
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 1600);
  };
  const run = (fn: () => Promise<unknown>, done?: string) =>
    start(async () => {
      await fn();
      if (done) flash(done);
      router.refresh();
    });
  const latest = weights.at(-1);

  return (
    <div className="safe-top">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
          <ChevronLeft className="size-4 rtl:rotate-180" /> {t.nav.today}
        </Link>
        <IconButton aria-label={t.pets.edit} onClick={() => setEditing(true)}>
          <Pencil className="size-5" />
        </IconButton>
      </div>

      <div className="flex items-center gap-4">
        <span className="flex size-20 items-center justify-center rounded-[1.75rem] bg-linear-to-br from-[#ff6a55] to-[#ffab91] text-5xl shadow-soft">{pet.emoji}</span>
        <div className="min-w-0">
          <h1 className="truncate text-[32px] font-extrabold leading-tight tracking-tight">{pet.name}</h1>
          <p className="text-muted">{[pet.breed, pet.birthday ? age(pet.birthday, today, t.pets) : null].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      {/* Food */}
      <SectionTitle>🦴 {t.pets.food}</SectionTitle>
      <Card className="space-y-3">
        {left !== null && total ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className={cn("text-2xl font-extrabold", left <= 5 ? "text-danger" : "")}>{fill(t.pets.daysLeft, { n: left })}</span>
              <span className="text-sm text-muted">{fill(t.pets.runsOut, { date: fmt.format(new Date(`${addDays(today, left)}T12:00:00`)) })}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-sunken">
              <div className={cn("h-full rounded-full transition-all", left <= 5 ? "bg-danger" : left <= 10 ? "bg-warn" : "bg-success")} style={{ width: `${Math.max(3, Math.min(100, (left / total) * 100))}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">{t.pets.addHint}</p>
        )}
        <div className="flex gap-2">
          <Button variant="soft" className="flex-1" loading={pending} onClick={() => run(() => newFoodBag(pet.id), "✓")}>
            🆕 {t.pets.newBag}
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => run(() => reorderFood(pet.id), t.pets.added)}>
            🛒 {t.pets.reorder}
          </Button>
        </div>
      </Card>

      {/* Weight */}
      <SectionTitle>⚖️ {t.pets.weight}</SectionTitle>
      <Card>
        {latest && (
          <p className="text-2xl font-extrabold">
            {latest.kg} <span className="text-base font-semibold text-muted">{t.pets.kg}</span>
            <span className="ms-2 text-xs font-semibold text-muted">{fmt.format(new Date(`${latest.day}T12:00:00`))}</span>
          </p>
        )}
        <Sparkline values={weights.map((w) => Number(w.kg))} />
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(kg);
            if (v > 0) run(() => logPetWeight(pet.id, v), "✓");
            setKg("");
          }}
        >
          <Input type="number" inputMode="decimal" step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} placeholder={`${t.pets.addWeight} (${t.pets.kg})`} className="h-11 flex-1" />
          <Button disabled={!kg}>{t.common.add}</Button>
        </form>
      </Card>

      {/* Vet */}
      {(pet.vet_name || pet.vet_phone) && (
        <>
          <SectionTitle>🩺 {t.pets.vet}</SectionTitle>
          <Card className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{pet.vet_name}</span>
              <span className="block text-sm text-muted" dir="ltr">
                {pet.vet_phone}
              </span>
            </span>
            {pet.vet_phone && (
              <>
                <a href={`tel:${pet.vet_phone}`} aria-label={t.pets.call} className="flex size-11 items-center justify-center rounded-2xl bg-success text-white">
                  <Phone className="size-5" />
                </a>
                <a href={`https://wa.me/${normalizePhone(pet.vet_phone)}`} aria-label="WhatsApp" className="flex size-11 items-center justify-center rounded-2xl bg-[#25d366] text-white">
                  <MessageCircle className="size-5" />
                </a>
              </>
            )}
          </Card>
        </>
      )}

      {/* Routines from the dog spaces */}
      {routines.length > 0 && (
        <>
          <SectionTitle>🐾 {t.pets.routines}</SectionTitle>
          <div className="space-y-2">
            {routines.map((r) => (
              <Link key={r.id} href={`/sections/${r.id}`} className="glass flex items-center gap-3 rounded-3xl p-3">
                <IconTile icon={r.icon} color={r.color} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{r.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {r.tracker && r.doneToday > 0 ? `✓ ${r.doneToday} · ` : ""}
                    {r.open.length ? r.open.slice(0, 3).join(" · ") : "✨"}
                  </span>
                </span>
                <ChevronRight className="size-5 text-faint rtl:rotate-180" />
              </Link>
            ))}
          </div>
        </>
      )}

      {pet.chip && <p className="mt-6 px-1 text-xs text-faint">🔖 {t.pets.chip}: {pet.chip}</p>}
      {pet.notes && <p className="mt-2 whitespace-pre-line px-1 text-sm text-muted">{pet.notes}</p>}

      {msg && <div className="fixed inset-x-4 bottom-28 z-50 mx-auto max-w-xs rounded-2xl bg-fg px-4 py-2.5 text-center text-sm font-semibold text-bg shadow-xl">{msg}</div>}

      <Sheet
        open={editing}
        onClose={() => setEditing(false)}
        title={`${pet.emoji} ${t.pets.edit}`}
        footer={
          <Button variant="danger" className="w-full" onClick={() => confirm(t.sections.deleteConfirm) && start(() => deletePet(pet.id))}>
            <Trash2 className="size-4" /> {t.common.delete}
          </Button>
        }
      >
        <PetForm pet={pet} onSaved={() => setEditing(false)} />
      </Sheet>
    </div>
  );
}
