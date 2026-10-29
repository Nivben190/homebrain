"use client";
import { useState } from "react";
import { renderSVG } from "uqr";
import { Link2 } from "lucide-react";
import { createInviteLink } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Button, Sheet } from "@/components/ui";

/** Makes a fresh single-use /join link, then shares it or shows it as a QR code (roadmap 2.1). */
export function InviteLinkButton({ variant = "soft" }: { variant?: "primary" | "soft" }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    const res = await createInviteLink();
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const link = `${location.origin}/join/${res.data.token}`;
    setUrl(link);
    if (navigator.share) navigator.share({ title: t.join.shareText, url: link }).catch(() => {});
  };

  return (
    <>
      <Button variant={variant} className="w-full" loading={busy} onClick={make}>
        <Link2 className="size-4" /> {t.join.shareLink}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Sheet open={!!url} onClose={() => setUrl(null)} title={t.join.shareLink}>
        {url && (
          <div className="space-y-3 pb-4 text-center">
            <div className="mx-auto w-56 rounded-2xl bg-white p-3" dangerouslySetInnerHTML={{ __html: renderSVG(url) }} />
            <button onClick={() => navigator.clipboard.writeText(url)} className="w-full break-all rounded-2xl bg-sunken px-4 py-3 font-mono text-sm" dir="ltr">
              {url}
            </button>
            <p className="text-sm text-muted">{t.join.linkHint}</p>
          </div>
        )}
      </Sheet>
    </>
  );
}
