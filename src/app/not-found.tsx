import Link from "next/link";
import { getT } from "@/lib/session";

/** Deleted spaces, old notification links and typos. */
export default async function NotFound() {
  const t = await getT();
  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-20 items-center justify-center rounded-[1.75rem] bg-accent-soft text-4xl">🧭</span>
      <h1 className="text-3xl font-extrabold tracking-tight">{t.errors.notFoundTitle}</h1>
      <p className="text-muted">{t.errors.notFoundBody}</p>
      <Link href="/" className="mt-2 flex h-14 w-full items-center justify-center rounded-2xl bg-accent font-semibold text-accent-fg">
        {t.errors.home}
      </Link>
    </main>
  );
}
