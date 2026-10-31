"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, X } from "lucide-react";
import { removePushDevice, sendTestPush } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Button, Card } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { errorKey } from "@/lib/errors";
import { cn } from "@/lib/cn";

export interface PushDevice {
  id: string;
  label: string;
  /** Seconds since the app last opened on it. */
  seenAgo: number;
  /** What the newest push to it did; null before the first one. */
  lastOk: boolean | null;
}

/** Roadmap 1.10: every phone that gets pushes, whether the last one arrived, and a test per phone. */
export function PushDevicesCard({ devices }: { devices: PushDevice[] }) {
  const { t } = useI18n();
  const s = t.settings;
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!devices.length) return null;

  const ago = (sec: number) =>
    sec < 90
      ? s.justNow
      : sec < 5400
        ? fill(s.minutesAgo, { n: Math.round(sec / 60) })
        : sec < 129600
          ? fill(s.hoursAgo, { n: Math.round(sec / 3600) })
          : fill(s.daysAgo, { n: Math.round(sec / 86400) });
  // Two iPhones in one account read "iPhone 1" and "iPhone 2".
  const name = (d: PushDevice, i: number) => (devices.filter((x) => x.label === d.label).length > 1 ? `${d.label} ${i + 1}` : d.label);

  async function act(id: string, run: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setBusy(id);
    const res = await run();
    setBusy(null);
    if (!res.ok) return toast.error(res.error === s.testPushFailed ? s.testPushFailed : t.failures[errorKey(res.error)]);
    if (done) toast.success(done);
    router.refresh();
  }

  return (
    <Card className="mt-3">
      <p className="mb-1 text-sm font-semibold text-muted">{s.devices}</p>
      <ul>
        {devices.map((d, i) => (
          <li key={d.id} className="flex items-center gap-3 py-2">
            <Smartphone className="size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{name(d, i)}</p>
              <p className="text-xs text-muted">
                {fill(s.deviceSeen, { ago: ago(d.seenAgo) })}
                {d.lastOk !== null && (
                  <span className={cn("ms-2", !d.lastOk && "font-semibold text-danger")}>
                    <span aria-hidden className={cn("me-1 inline-block size-1.5 rounded-full align-middle", d.lastOk ? "bg-success" : "bg-danger")} />
                    {d.lastOk ? s.deviceLastOk : s.deviceLastFailed}
                  </span>
                )}
              </p>
            </div>
            <Button size="sm" variant="soft" loading={busy === d.id} aria-label={fill(s.deviceTest, { name: name(d, i) })} onClick={() => act(d.id, () => sendTestPush(d.id), "🔔")}>
              {s.testPush}
            </Button>
            <button
              aria-label={fill(s.deviceRemove, { name: name(d, i) })}
              disabled={busy === d.id}
              onClick={() => act(d.id, () => removePushDevice(d.id))}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted active:bg-sunken"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
