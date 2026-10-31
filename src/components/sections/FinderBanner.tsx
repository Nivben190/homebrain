"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { useI18n } from "@/i18n/client";

const DISMISSED = "finder-banner-dismissed";

/** For a home with only a few spaces: a way into "Help me choose" instead of the whole gallery. */
export function FinderBanner() {
  const { t } = useI18n();
  // Hidden until we know it wasn't dismissed, so it doesn't flash.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(DISMISSED) !== "1");
    } catch {
      setShow(true);
    }
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Private mode: hidden for this visit only.
    }
  }

  if (!show) return null;
  return (
    <div className="glass relative mb-3 rounded-3xl p-4">
      <button type="button" onClick={dismiss} aria-label={t.finder.dismiss} className="absolute end-3 top-3 text-muted">
        <X className="size-4" />
      </button>
      <p className="pe-6 font-bold">{t.finder.bannerTitle}</p>
      <p className="mt-1 text-sm text-muted">{t.finder.bannerBody}</p>
      <Link href="/sections?find=1" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-fg">
        <Sparkles className="size-4" /> {t.finder.bannerCta}
      </Link>
    </div>
  );
}
