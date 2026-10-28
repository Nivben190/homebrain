"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui";

/** Any screen that throws lands here, inside the app's layout and language. */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-20 items-center justify-center rounded-[1.75rem] bg-danger/12 text-4xl">😵‍💫</span>
      <h1 className="text-3xl font-extrabold tracking-tight">{t.errors.title}</h1>
      <p className="text-muted">{t.errors.body}</p>
      <div className="mt-2 flex w-full flex-col gap-2">
        <Button size="lg" onClick={reset}>
          {t.errors.retry}
        </Button>
        <Link href="/" className="flex h-14 items-center justify-center rounded-2xl bg-sunken font-semibold">
          {t.errors.home}
        </Link>
      </div>
      {error.digest && <p className="font-mono text-xs text-muted">#{error.digest}</p>}
    </main>
  );
}
