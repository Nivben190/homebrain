"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addSharedSpace } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui";
import { errorKey } from "@/lib/errors";

/** Adds the shared template to this home and opens the new space. */
export function AddSharedSpace({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add() {
    setBusy(true);
    setError(null);
    const res = await addSharedSpace(token);
    setBusy(false);
    if (!res.ok) return setError(res.error === "not found" ? t.shared.gone : t.failures[errorKey(res.error)]);
    router.push(`/sections/${res.data.id}`);
  }
  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button size="lg" className="w-full" loading={busy} onClick={add}>
        {t.shared.add}
      </Button>
    </div>
  );
}
