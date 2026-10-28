"use client";
import "./globals.css";

/**
 * Last resort when the root layout itself fails: no session, no language, so
 * both languages are shown.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="text-5xl">🧠</span>
          <h1 className="text-3xl font-extrabold tracking-tight">Something went wrong</h1>
          <p className="text-xl font-bold" dir="rtl" lang="he">
            משהו השתבש
          </p>
          <button onClick={reset} className="mt-2 h-14 w-full rounded-2xl bg-accent font-semibold text-accent-fg">
            Try again · נסו שוב
          </button>
          {/* A full reload on purpose: the root layout itself failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="flex h-14 w-full items-center justify-center rounded-2xl bg-sunken font-semibold">
            Home · הביתה
          </a>
        </main>
      </body>
    </html>
  );
}
