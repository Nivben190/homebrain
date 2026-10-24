"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { newFoodBag, savePet } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Button, Chip, Field, Input, Textarea } from "@/components/ui";
import type { Pet } from "@/lib/db-types";

const PET_EMOJIS = ["🐶", "🐕", "🦮", "🐩", "🐕‍🦺", "🐾", "🐱", "🐈"];

/** Create or edit a pet. New pets with food info start a bag today. */
export function PetForm({ pet, onSaved }: { pet?: Pet; onSaved?: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [f, setF] = useState({
    name: pet?.name ?? "",
    emoji: pet?.emoji ?? "🐶",
    breed: pet?.breed ?? "",
    birthday: pet?.birthday ?? "",
    food_bag_kg: pet?.food_bag_kg?.toString() ?? "",
    daily_grams: pet?.daily_grams?.toString() ?? "",
    vet_name: pet?.vet_name ?? "",
    vet_phone: pet?.vet_phone ?? "",
    chip: pet?.chip ?? "",
    notes: pet?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const num = (v: string) => (v.trim() ? Number(v) : null);
  const txt = (v: string) => v.trim() || null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await savePet(pet?.id ?? null, {
        name: f.name,
        emoji: f.emoji,
        breed: txt(f.breed),
        birthday: txt(f.birthday),
        food_bag_kg: num(f.food_bag_kg),
        daily_grams: num(f.daily_grams),
        vet_name: txt(f.vet_name),
        vet_phone: txt(f.vet_phone),
        chip: txt(f.chip),
        notes: txt(f.notes),
      });
      if (!res.ok || !res.id) return setError(res.ok ? "Error" : res.error);
      if (!pet && num(f.food_bag_kg) && num(f.daily_grams)) await newFoodBag(res.id);
      if (onSaved) onSaved();
      else router.replace(`/pets/${res.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="space-y-4 pb-4">
      <div className="flex flex-wrap gap-2">
        {PET_EMOJIS.map((e) => (
          <Chip key={e} active={f.emoji === e} onClick={() => setF({ ...f, emoji: e })} className="h-11 min-w-11 text-xl">
            {e}
          </Chip>
        ))}
      </div>
      <Field label={t.pets.name}>
        <Input required value={f.name} onChange={set("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.pets.breed}>
          <Input value={f.breed} onChange={set("breed")} />
        </Field>
        <Field label={t.pets.birthday}>
          <Input type="date" value={f.birthday} onChange={set("birthday")} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`🦴 ${t.pets.bagKg}`}>
          <Input type="number" inputMode="decimal" step="0.1" value={f.food_bag_kg} onChange={set("food_bag_kg")} placeholder="12" />
        </Field>
        <Field label={t.pets.dailyGrams}>
          <Input type="number" inputMode="numeric" value={f.daily_grams} onChange={set("daily_grams")} placeholder="300" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`🩺 ${t.pets.vetName}`}>
          <Input value={f.vet_name} onChange={set("vet_name")} />
        </Field>
        <Field label={t.pets.vetPhone}>
          <Input type="tel" inputMode="tel" value={f.vet_phone} onChange={set("vet_phone")} />
        </Field>
      </div>
      <Field label={t.pets.chip}>
        <Input value={f.chip} onChange={set("chip")} inputMode="numeric" />
      </Field>
      <Field label={t.sections.notes}>
        <Textarea value={f.notes} onChange={set("notes")} rows={3} />
      </Field>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button size="lg" className="w-full" loading={pending}>
        {t.pets.save}
      </Button>
    </form>
  );
}
