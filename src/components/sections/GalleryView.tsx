"use client";
import { AnimatePresence, motion } from "motion/react";
import { RemoveBadge } from "./SwipeRow";
import { Dices } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { colorClass } from "@/components/ui";
import { readPhotos, usePhotoUrls } from "@/lib/photos";
import type { Item, Section } from "@/lib/db-types";

/** First date / rating properties drive the card's date chip and hearts. */
export function memoryMeta(section: Section, item: Item) {
  const dateProp = section.schema.find((p) => p.type === "date");
  const ratingProp = section.schema.find((p) => p.type === "rating");
  const date = dateProp ? (item.props[dateProp.id] as string | undefined) : undefined;
  const rating = ratingProp ? Number(item.props[ratingProp.id]) || 0 : 0;
  return { date: date || null, rating };
}

/** Polaroid-style memory cards in two columns, newest first. */
export function GalleryView({
  section,
  items,
  onOpen,
  editing = false,
  onDelete,
}: {
  section: Section;
  items: Item[];
  onOpen: (item: Item) => void;
  editing?: boolean;
  onDelete?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const covers = items.map((i) => readPhotos(i.props).find((p) => p.kind === "image"));
  const urls = usePhotoUrls(covers.flatMap((c) => (c ? [c.thumb ?? c.path] : [])));
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  const sorted = items
    .map((item, i) => ({ item, cover: covers[i], ...memoryMeta(section, item) }))
    .sort((a, b) => (b.date ?? b.item.created_at).localeCompare(a.date ?? a.item.created_at));

  return (
    <>
      {items.length > 1 && (
        <button
          onClick={() => onOpen(items[Math.floor(Math.random() * items.length)])}
          className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-bold text-accent transition active:scale-95"
        >
          <Dices className="size-4" /> {t.memories.surprise}
        </button>
      )}
      {items.length === 0 && <p className="glass rounded-3xl px-4 py-10 text-center text-muted">{t.memories.addFirst}</p>}
      {/* Two columns filled alternately, so newest-first reads left → right. */}
      <div className="flex items-start gap-3">
        {[0, 1].map((col) => (
          <div key={col} className="flex min-w-0 flex-1 flex-col gap-3">
            {sorted.filter((_, i) => i % 2 === col).map(({ item, cover, date, rating }, j) => {
              const i = j * 2 + col;
              return (
          <div key={item.id} className="relative">
          <motion.button
            layout
            onClick={() => onOpen(item)}
            whileTap={{ scale: 0.96, rotate: 0 }}
            style={{ rotate: i % 3 === 0 ? -1.2 : i % 3 === 1 ? 1 : -0.4 }}
            className="block w-full rounded-2xl bg-card-solid p-2 pb-3 text-start shadow-soft"
          >
            {cover && urls[cover.thumb ?? cover.path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[cover.thumb ?? cover.path]} alt="" className="w-full rounded-xl object-cover" style={{ aspectRatio: i % 2 ? "4 / 5" : "1 / 1" }} loading="lazy" />
            ) : (
              <span className={cn("flex w-full items-center justify-center rounded-xl bg-linear-to-br text-5xl", colorClass(section.color))} style={{ aspectRatio: i % 2 ? "4 / 5" : "1 / 1" }}>
                {section.icon}
              </span>
            )}
            <span className="mt-2 block px-1 text-[15px] font-bold leading-snug">{item.title}</span>
            {(date || rating > 0) && (
              <span className="mt-0.5 flex items-center justify-between gap-1 px-1 text-xs text-muted">
                <span>{date ? fmt.format(new Date(`${date.slice(0, 10)}T12:00:00`)) : ""}</span>
                {rating > 0 && <span className="tracking-tighter">{"❤️".repeat(rating)}</span>}
              </span>
            )}
          </motion.button>
          <AnimatePresence>{editing && onDelete && <RemoveBadge onClick={() => onDelete(item.id)} className="absolute -start-1.5 -top-1.5 z-10" />}</AnimatePresence>
          </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
