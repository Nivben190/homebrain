"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { colorClass } from "@/components/ui";
import { usePhotoUrls, type Photo } from "@/lib/photos";

export interface Memory {
  id: string;
  sectionId: string;
  title: string;
  years: number;
  icon: string;
  color: string;
  cover: Photo | null;
}

/** "1 year ago today" cards for memory spaces. */
export function OnThisDay({ memories }: { memories: Memory[] }) {
  const { t } = useI18n();
  const urls = usePhotoUrls(memories.flatMap((m) => (m.cover ? [m.cover.thumb ?? m.cover.path] : [])));
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
      {memories.map((m, i) => (
        <motion.div key={m.id} style={{ rotate: i % 2 ? 1.2 : -1.2 }} whileTap={{ scale: 0.96, rotate: 0 }} className="shrink-0">
          <Link href={`/sections/${m.sectionId}`} className="block w-40 rounded-2xl bg-card-solid p-2 pb-2.5 shadow-soft">
            {m.cover && urls[m.cover.thumb ?? m.cover.path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[m.cover.thumb ?? m.cover.path]} alt="" className="aspect-square w-full rounded-xl object-cover" />
            ) : (
              <span className={cn("flex aspect-square w-full items-center justify-center rounded-xl bg-linear-to-br text-5xl", colorClass(m.color))}>{m.icon}</span>
            )}
            <span className="mt-2 block truncate px-1 text-sm font-bold">{m.title}</span>
            <span className="block px-1 text-xs font-semibold text-accent">{m.years === 1 ? t.memories.yearAgo : t.memories.yearsAgo.replace("{n}", String(m.years))}</span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
