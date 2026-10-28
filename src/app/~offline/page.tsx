import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline · Home Brain" };

/**
 * Precached by the service worker and shown when a page can't load without a
 * connection. It's cached once, whatever language was on, so it shows both.
 */
export default function Offline() {
  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-20 items-center justify-center rounded-[1.75rem] bg-accent-soft text-4xl">📡</span>
      <div dir="ltr" lang="en" className="space-y-1">
        <h1 className="text-3xl font-extrabold tracking-tight">You&apos;re offline</h1>
        <p className="text-muted">This page needs a connection. It will load as soon as you&apos;re back online.</p>
      </div>
      <div dir="rtl" lang="he" className="mt-4 space-y-1">
        <p className="text-2xl font-extrabold">אין חיבור לאינטרנט</p>
        <p className="text-muted">הדף הזה צריך חיבור. הוא ייטען ברגע שהחיבור יחזור.</p>
      </div>
    </main>
  );
}
