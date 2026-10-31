"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/client";

const LOADED = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const EVERY = 10 * 60 * 1000;

/**
 * "New version · Tap to refresh" once a deploy lands while the app is open, so a
 * page from the old build never calls server actions the new one dropped (roadmap 1.11).
 */
export function UpdatePrompt() {
  const { t } = useI18n();
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (LOADED === "dev") return;
    let done = false;
    const check = async () => {
      if (done || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { build } = (await res.json()) as { build?: string };
        if (build && build !== "dev" && build !== LOADED) {
          done = true;
          setStale(true);
        }
      } catch {
        // offline or mid-deploy; the next check will tell
      }
    };
    void check();
    const timer = setInterval(check, EVERY);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, []);

  if (!stale) return null;
  return (
    <button
      onClick={() => window.location.reload()}
      className="safe-top fixed inset-x-0 top-2 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-lg"
    >
      <RefreshCw className="size-4" />
      {t.update.ready} · {t.update.refresh}
    </button>
  );
}
