"use client";
import { Plus } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { QUICK_ADD_OPEN } from "@/components/QuickAdd";

/** "+" on a calendar day: opens quick-add with that day filled in. */
export function CalendarAddButton({ day }: { day: string }) {
  const { t } = useI18n();
  return (
    <button aria-label={t.calendar.add} onClick={() => window.dispatchEvent(new CustomEvent(QUICK_ADD_OPEN, { detail: { day } }))} className="flex size-8 items-center justify-center rounded-full bg-sunken text-muted">
      <Plus className="size-4" />
    </button>
  );
}
