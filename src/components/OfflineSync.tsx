"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { idbQueue, QUEUE_CHANGED, replay, type QueuedWrite } from "@/lib/offline-queue";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";

function run(op: QueuedWrite) {
  const table = supabaseBrowser().from(op.table);
  const filtered = <Q extends { eq: (c: string, v: string) => Q }>(q: Q) => Object.entries(op.match ?? {}).reduce((acc, [c, v]) => acc.eq(c, v), q);
  if (op.action === "upsert") return table.upsert(op.values!, op.onConflict ? { onConflict: op.onConflict } : undefined);
  if (op.action === "update") return filtered(table.update(op.values!));
  return filtered(table.delete());
}

/** "3 changes waiting" while offline; replays the queue when the connection returns (roadmap 2.5). */
export function OfflineSync() {
  const { t } = useI18n();
  const router = useRouter();
  const [waiting, setWaiting] = useState(0);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let busy = false;
    const count = () => idbQueue.all().then((q) => setWaiting(q.length)).catch(() => {});
    const flush = async () => {
      setOffline(!navigator.onLine);
      if (busy || !navigator.onLine) return;
      busy = true;
      try {
        const before = (await idbQueue.all()).length;
        const left = await replay(idbQueue, run, (op, error) => console.error("[offline] dropped", op, error));
        setWaiting(left);
        // Realtime brings the other phone along; this one reloads what the server now holds.
        if (before > left) router.refresh();
      } catch {
        // IndexedDB unavailable.
      } finally {
        busy = false;
      }
    };
    void count();
    void flush();
    window.addEventListener("online", flush);
    window.addEventListener("offline", flush);
    window.addEventListener(QUEUE_CHANGED, count);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("offline", flush);
      window.removeEventListener(QUEUE_CHANGED, count);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [router]);

  if (!offline && waiting === 0) return null;
  return (
    <div role="status" className="safe-top fixed inset-x-0 top-2 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg shadow-lg">
      <CloudOff className="size-4" />
      {waiting > 0 ? fill(t.offline.waiting, { n: String(waiting) }) : t.offline.offline}
    </div>
  );
}
