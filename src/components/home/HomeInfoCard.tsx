"use client";
import { useState } from "react";
import { renderSVG } from "uqr";
import { Lock, Plus, Trash2 } from "lucide-react";
import { readHomeSecrets, saveHomeInfo, saveHomeSecrets } from "@/app/actions";
import { wifiQr, type GuestField, type HomeInfo } from "@/lib/home-info";
import { useI18n } from "@/i18n/client";
import { Button, Card, Field, Input, SectionTitle, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toaster";

type Row = { label: string; value: string };

function Rows({ rows, onChange, labelHint, valueHint, tel }: { rows: Row[]; onChange: (r: Row[]) => void; labelHint: string; valueHint: string; tel?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      {rows.map((r, n) => (
        <div key={n} className="flex gap-2">
          <Input aria-label={labelHint} placeholder={labelHint} value={r.label} onChange={(e) => onChange(rows.map((x, i) => (i === n ? { ...x, label: e.target.value } : x)))} className="h-10 flex-1" />
          <Input aria-label={valueHint} placeholder={valueHint} type={tel ? "tel" : "text"} dir="ltr" value={r.value} onChange={(e) => onChange(rows.map((x, i) => (i === n ? { ...x, value: e.target.value } : x)))} className="h-10 flex-1" />
          <button aria-label={t.common.delete} onClick={() => onChange(rows.filter((_, i) => i !== n))} className="px-1 text-muted">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...rows, { label: "", value: "" }])}>
        <Plus className="size-4" /> {t.common.add}
      </Button>
    </div>
  );
}

/** Wi-Fi with a join QR, account numbers, emergency contacts, the vet; owner-only secrets (roadmap 3.9). */
export function HomeInfoCard({ initial, owner }: { initial: HomeInfo; owner: boolean }) {
  const { t } = useI18n();
  const h = t.homeInfo;
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [secrets, setSecrets] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const info = v.info;
  const setInfo = (patch: Partial<HomeInfo["info"]>) => setV({ ...v, info: { ...info, ...patch } });

  async function save() {
    setBusy(true);
    const res = await saveHomeInfo(v);
    setBusy(false);
    if (res.ok) toast.success(t.settings.saved);
    else toast.error(res.error);
  }

  return (
    <>
      <SectionTitle>📶 {h.wifi}</SectionTitle>
      <Card className="space-y-3">
        <Field label={h.wifiName}>
          <Input value={v.wifi_name ?? ""} onChange={(e) => setV({ ...v, wifi_name: e.target.value || null })} dir="ltr" />
        </Field>
        <Field label={h.wifiPassword}>
          <Input value={v.wifi_password ?? ""} onChange={(e) => setV({ ...v, wifi_password: e.target.value || null })} dir="ltr" />
        </Field>
        {v.wifi_name && (
          <div className="mx-auto w-48 rounded-2xl bg-white p-3" role="img" aria-label={h.wifiQr} dangerouslySetInnerHTML={{ __html: renderSVG(wifiQr(v.wifi_name, v.wifi_password)) }} />
        )}
      </Card>

      <SectionTitle>🆘 {h.contacts}</SectionTitle>
      <Card>
        <Rows rows={info.contacts.map((c) => ({ label: c.label, value: c.phone }))} onChange={(r) => setInfo({ contacts: r.map((x) => ({ label: x.label, phone: x.value })) })} labelHint={h.who} valueHint={h.phone} tel />
      </Card>

      <SectionTitle>🐾 {h.vet}</SectionTitle>
      <Card className="flex gap-2">
        <Input placeholder={h.who} aria-label={h.vet} value={info.vet.name} onChange={(e) => setInfo({ vet: { ...info.vet, name: e.target.value } })} className="flex-1" />
        <Input placeholder={h.phone} aria-label={h.phone} type="tel" dir="ltr" value={info.vet.phone} onChange={(e) => setInfo({ vet: { ...info.vet, phone: e.target.value } })} className="flex-1" />
      </Card>

      <SectionTitle>🧾 {h.accounts}</SectionTitle>
      <Card>
        <Rows rows={info.accounts} onChange={(accounts) => setInfo({ accounts })} labelHint={h.accountLabel} valueHint={h.accountNumber} />
      </Card>

      <SectionTitle>📝 {h.notes}</SectionTitle>
      <Card>
        <Textarea value={info.notes} onChange={(e) => setInfo({ notes: e.target.value })} rows={4} />
      </Card>

      <SectionTitle>👀 {h.guests}</SectionTitle>
      <Card className="space-y-2">
        <p className="text-sm text-muted">{h.guestsHint}</p>
        <div className="flex flex-wrap gap-2">
          {(["wifi", "contacts", "vet", "notes"] as GuestField[]).map((f) => {
            const on = v.guest_fields.includes(f);
            return (
              <button key={f} aria-pressed={on} onClick={() => setV({ ...v, guest_fields: on ? v.guest_fields.filter((x) => x !== f) : [...v.guest_fields, f] })} className={on ? "rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg" : "rounded-full bg-sunken px-3 py-1.5 text-sm font-semibold"}>
                {h.fields[f]}
              </button>
            );
          })}
        </div>
      </Card>

      <Button className="mt-4 w-full" loading={busy} onClick={save}>
        {t.common.save}
      </Button>

      {owner && (
        <>
          <SectionTitle>
            <Lock className="inline size-3.5" /> {h.secrets}
          </SectionTitle>
          <Card className="space-y-3">
            <p className="text-sm text-muted">{h.secretsHint}</p>
            {secrets === null ? (
              <Button variant="soft" onClick={async () => {
                const res = await readHomeSecrets();
                if (res.ok) setSecrets(res.data);
                else toast.error(res.error);
              }}>
                {h.showSecrets}
              </Button>
            ) : (
              <>
                <Textarea value={secrets} onChange={(e) => setSecrets(e.target.value)} rows={3} dir="ltr" />
                <Button variant="soft" onClick={async () => {
                  const res = await saveHomeSecrets(secrets);
                  if (res.ok) toast.success(t.settings.saved);
                  else toast.error(res.error);
                }}>
                  {t.common.save}
                </Button>
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
