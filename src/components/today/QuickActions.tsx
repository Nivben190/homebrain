"use client";
import { useState } from "react";
import Link from "next/link";
import { AlarmClock, MessageCircleHeart } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { AlarmSheet } from "./QuickAlarm";
import { AskSheet } from "./Requests";
import type { Member } from "@/components/sections/PropertyInput";
import { fill } from "@/i18n";

export interface PetSummary {
  id: string;
  name: string;
  emoji: string;
  daysLeft: number | null;
}

/** Three big tiles: alarm, ask someone at home, the dog. */
export function QuickActions({ others, pets }: { others: Member[]; pets: PetSummary[] }) {
  const { t } = useI18n();
  const [alarm, setAlarm] = useState(false);
  const [ask, setAsk] = useState(false);
  const tile = "glass flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-3xl px-2 py-3 text-center transition active:scale-95";

  return (
    <>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 [&>*]:min-w-[30%]">
        <button onClick={() => setAlarm(true)} className={tile}>
          <span className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-[#2f8cff] to-[#7457ff] text-white">
            <AlarmClock className="size-5" />
          </span>
          <span className="w-full truncate text-xs font-bold">{t.alarm.title}</span>
        </button>
        {others.length > 0 && (
          <button onClick={() => setAsk(true)} className={tile}>
            <span className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-[#ff5f9e] to-[#ffa1c6] text-white">
              <MessageCircleHeart className="size-5" />
            </span>
            <span className="w-full truncate text-xs font-bold">{others.length === 1 ? fill(t.ask.button, { name: others[0].name }) : t.ask.buttonAny}</span>
          </button>
        )}
        {(pets.length ? pets : [null]).map((pet) => (
          <Link key={pet?.id ?? "new"} href={pet ? `/pets/${pet.id}` : "/pets/new"} className={tile}>
            <span className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-[#ff6a55] to-[#ffab91] text-2xl">{pet?.emoji ?? "🐶"}</span>
            <span className="w-full truncate text-xs font-bold">{pet ? pet.name : t.pets.add}</span>
            {pet?.daysLeft !== null && pet?.daysLeft !== undefined && (
              <span className={`text-[10px] font-semibold ${pet.daysLeft <= 5 ? "text-danger" : "text-muted"}`}>🦴 {fill(t.pets.daysLeft, { n: pet.daysLeft })}</span>
            )}
          </Link>
        ))}
      </div>
      <AlarmSheet open={alarm} onClose={() => setAlarm(false)} />
      {others.length > 0 && <AskSheet open={ask} onClose={() => setAsk(false)} members={others} />}
    </>
  );
}
