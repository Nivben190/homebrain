"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Button, Card, Toggle } from "@/components/ui";

/** "Move to this home" for someone who already has one. */
export function MoveHome({ token, home, current, alone }: { token: string; home: string; current: string; alone: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [bring, setBring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="space-y-4">
      <p className="text-sm text-muted">{fill(t.join.moveHint, { home, current })}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">{t.join.bring}</span>
        <Toggle checked={bring} onChange={setBring} />
      </div>
      {alone && !bring && <p className="text-sm text-warn">{fill(t.join.bringAlone, { current })}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button
        className="w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const res = await acceptInvite(token, bring);
          setBusy(false);
          if (!res.ok) return setError(res.error === "expired" ? t.join.expired : res.error);
          router.replace("/");
          router.refresh();
        }}
      >
        {t.join.move}
      </Button>
    </Card>
  );
}
