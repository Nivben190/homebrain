"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Button } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { SECTION_TEMPLATES } from "@/lib/registry/templates";
import { addSpace } from "@/components/sections/NewSectionButton";
import { holidaySpaceTitle, type HostingHoliday } from "@/lib/holidays";
import { errorKey } from "@/lib/errors";

const dismissedKey = (h: HostingHoliday) => `holiday-dismissed:${h.key}`;

/** Three weeks before a chag: make that holiday's hosting list in one tap. */
export function HolidayCard({
  holiday,
  householdId,
  userId,
  timeZone,
  privateOnly = false,
}: {
  holiday: HostingHoliday;
  householdId: string;
  userId: string;
  timeZone: string;
  /** A teen's spaces are always their own. */
  privateOnly?: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = locale === "he" ? holiday.hebrew : holiday.name;

  useEffect(() => {
    try {
      setShow(localStorage.getItem(dismissedKey(holiday)) !== "1");
    } catch {
      setShow(true);
    }
  }, [holiday]);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(dismissedKey(holiday), "1");
    } catch {
      // Private mode: hidden for this visit only.
    }
  }

  async function create() {
    const tpl = SECTION_TEMPLATES.find((s) => s.key === "holidays")!;
    setBusy(true);
    setError(null);
    const res = await addSpace(supabaseBrowser(), tpl, { householdId, ownerId: privateOnly ? userId : null, title: holidaySpaceTitle(holiday, locale), icon: tpl.icon, color: tpl.color, locale, timeZone });
    setBusy(false);
    if ("error" in res) return setError(t.failures[errorKey(res.error)]);
    router.push(`/sections/${res.id}`);
  }

  if (!show) return null;
  return (
    <div className="glass relative mb-3 rounded-3xl p-4">
      <button type="button" onClick={dismiss} aria-label={t.holidays.dismiss} className="absolute end-3 top-3 text-muted">
        <X className="size-4" />
      </button>
      <p className="pe-6 font-bold">{fill(t.holidays.title, { holiday: name, n: String(holiday.days) })}</p>
      <p className="mt-1 text-sm text-muted">{t.holidays.body}</p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <Button className="mt-3" loading={busy} onClick={create}>
        {fill(t.holidays.cta, { holiday: name })}
      </Button>
    </div>
  );
}
