"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { renderSVG } from "uqr";
import { createGuestLink, revokeGuestLink } from "@/app/actions";
import { GUEST_LINK_DAYS } from "@/lib/guest-links";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Button, Card, Field, Input, SectionTitle, Select, Sheet, Toggle } from "@/components/ui";
import { useToast } from "@/components/Toaster";

export interface ActiveGuestLink {
  token: string;
  label: string;
  expires_at: string;
  space: string | null;
}

/** Make and revoke sitter links (roadmap 3.3). */
export function GuestLinks({ links, spaces }: { links: ActiveGuestLink[]; spaces: { id: string; icon: string; title: string }[] }) {
  const { t, locale } = useI18n();
  const g = t.guest;
  const router = useRouter();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [sectionId, setSectionId] = useState<string>(spaces[0]?.id ?? "");
  const [days, setDays] = useState<number>(3);
  const [includeInfo, setIncludeInfo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  async function make() {
    setBusy(true);
    const res = await createGuestLink({ sectionId: sectionId || null, includeInfo, days, label });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    const link = `${location.origin}/g/${res.data.token}`;
    setUrl(link);
    if (navigator.share) navigator.share({ title: g.shareTitle, url: link }).catch(() => {});
    router.refresh();
  }

  return (
    <>
      <SectionTitle>🔗 {g.links}</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-muted">{g.linksHint}</p>
        <Field label={g.who}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={g.whoPlaceholder} />
        </Field>
        <Field label={g.space}>
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">{g.noSpace}</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={g.for}>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {GUEST_LINK_DAYS.map((d) => (
              <option key={d} value={d}>
                {fill(g.days, { n: d })}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center justify-between gap-3">
          <span className="font-medium">{g.includeInfo}</span>
          <Toggle checked={includeInfo} onChange={setIncludeInfo} />
        </label>
        <Button className="w-full" loading={busy} onClick={make}>
          {g.make}
        </Button>
        {links.length > 0 && (
          <div className="divide-y divide-card-border pt-2">
            {links.map((l) => (
              <div key={l.token} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{l.label || g.guest}</span>
                  <span className="block truncate text-xs text-muted">
                    {l.space ?? "🏠"} · {fill(g.until, { when: fmt.format(new Date(l.expires_at)) })}
                  </span>
                </span>
                <button
                  onClick={async () => {
                    const res = await revokeGuestLink(l.token);
                    if (res.ok) router.refresh();
                    else toast.error(res.error);
                  }}
                  className="text-sm font-semibold text-danger"
                >
                  {g.revoke}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Sheet open={!!url} onClose={() => setUrl(null)} title={g.links}>
        {url && (
          <div className="space-y-3 pb-4 text-center">
            <div className="mx-auto w-56 rounded-2xl bg-white p-3" dangerouslySetInnerHTML={{ __html: renderSVG(url) }} />
            <button onClick={() => navigator.clipboard.writeText(url)} className="w-full break-all rounded-2xl bg-sunken px-4 py-3 font-mono text-sm" dir="ltr">
              {url}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
