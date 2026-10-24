"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Re-renders the current server page when any of `tables` change (RLS-filtered). */
export function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const key = tables.join(",");
  useEffect(() => {
    const sb = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    const channel = sb.channel(`refresh:${key}`);
    for (const table of key.split(",")) channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    channel.subscribe();
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      sb.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, router]);
  return null;
}
