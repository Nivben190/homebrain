"use client";
import { useEffect } from "react";

/** Keeps the Home Screen badge equal to the "Waiting for you" count (roadmap 2.6). */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
  }, [count]);
  return null;
}
