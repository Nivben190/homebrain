"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";

const PULL = 70;

/**
 * Pull down at the top of a screen to refresh it, as in an installed app. Only from
 * the Home Screen: a browser tab has its own pull-to-reload.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const distance = useRef(0);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    const down = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      distance.current = Math.max(0, Math.min(PULL * 1.5, e.touches[0].clientY - start.current));
      setPull(distance.current);
    };
    const up = () => {
      if (start.current !== null && distance.current >= PULL) {
        setBusy(true);
        router.refresh();
        setTimeout(() => setBusy(false), 900);
      }
      start.current = null;
      distance.current = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [router]);

  if (!pull && !busy) return null;
  return (
    <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-2" style={{ transform: `translateY(${busy ? PULL / 2 : pull / 2}px)` }}>
      <span className="glass flex size-9 items-center justify-center rounded-full">
        <RotateCw className={cn("size-4 text-accent", busy && "animate-spin")} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
      </span>
    </div>
  );
}
