"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { deleteAccount } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Button, Card, Field, Input, SectionTitle, Sheet } from "@/components/ui";

/** Me → Your data (roadmap 1.8): export everything, or delete the account. */
export function YourDataCard({ email, partners }: { email: string; partners: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  const remove = async () => {
    setBusy(true);
    const res = await deleteAccount(typed);
    setBusy(false);
    if (!res.ok) return setError(res.error === "confirm" ? t.settings.deleteMismatch : res.error);
    router.replace("/login");
  };

  return (
    <>
      <SectionTitle>{t.settings.yourData}</SectionTitle>
      <Card className="space-y-3">
        <a href="/api/export" download className="flex items-center gap-3">
          <Download className="size-6 shrink-0 text-accent" />
          <span className="flex-1">
            <span className="block font-semibold">{t.settings.exportTitle}</span>
            <span className="block text-sm text-muted">{t.settings.exportHint}</span>
          </span>
        </a>
        <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3 text-start text-danger">
          <Trash2 className="size-6 shrink-0" />
          <span className="font-semibold">{t.settings.deleteTitle}</span>
        </button>
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title={t.settings.deleteTitle}>
        <div className="space-y-4 pb-4">
          <p className="text-sm text-muted">{partners.length ? fill(t.settings.deleteShared, { names: partners.join(", ") }) : t.settings.deleteSole}</p>
          <Field label={t.settings.deleteConfirm}>
            <Input type="email" autoComplete="off" value={typed} onChange={(e) => { setTyped(e.target.value); setError(null); }} placeholder={email} dir="ltr" />
          </Field>
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <Button variant="danger" className="w-full" disabled={!matches || busy} onClick={remove}>
            {busy ? t.common.loading : t.settings.deleteButton}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
