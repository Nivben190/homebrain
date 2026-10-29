import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/url";
import { fill } from "@/i18n";
import { Card } from "@/components/ui";
import { CopyField } from "@/components/settings/CopyField";
import { NotesSyncHelp } from "@/components/settings/NotesSyncHelp";
import { HookKeyField, type KeyInfo } from "@/components/settings/HookKey";
import { ALARM_SHORTCUT_NAME, alarmShortcutUrl } from "@/lib/engine/render";
import { legacyAccepted, type HookPurpose } from "@/lib/hook-keys";

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
          <span className="text-[15px]">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function IphonePage() {
  const { supabase, user, profile } = await requireHome();
  const t = await getT();
  const origin = await appOrigin();
  const [{ data: keys }, { data: legacy }] = await Promise.all([
    supabase.from("hook_keys").select("purpose,last_used_at").is("revoked_at", null).returns<{ purpose: HookPurpose; last_used_at: string | null }[]>(),
    createSupabaseAdmin().from("profiles").select("hook_token_used_at").eq("user_id", user.id).maybeSingle<{ hook_token_used_at: string | null }>(),
  ]);
  const info = (purpose: HookPurpose): KeyInfo => {
    const key = keys?.find((k) => k.purpose === purpose);
    return { exists: !!key, lastUsedAt: key?.last_used_at ?? null };
  };
  const legacyUsedAt = legacyAccepted() ? legacy?.hook_token_used_at : null;
  const when = (iso: string) => new Date(iso).toLocaleString(profile.locale === "he" ? "he-IL" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: profile.timezone });

  return (
    <div className="safe-top">
      <Link href="/me" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4 rtl:rotate-180" /> {t.settings.title}
      </Link>
      <h1 className="text-[30px] font-extrabold tracking-tight">📱 {t.iphone.title}</h1>
      <p className="mt-1 text-muted">{t.iphone.intro}</p>

      {legacyUsedAt && (
        <p role="alert" className="mt-4 rounded-2xl bg-warn/15 p-3 text-sm font-semibold">
          {fill(t.keys.legacy, { when: when(legacyUsedAt) })}
        </p>
      )}

      <Card className="mt-6">
        <h2 className="mb-3 text-lg font-extrabold">☀️ {t.iphone.wakeTitle}</h2>
        <Steps steps={t.iphone.wakeSteps} />
        <div className="mt-4 space-y-3">
          <CopyField label={t.iphone.hookUrl} value={`${origin}/api/hooks/event?type=wake`} />
          <HookKeyField purpose="event" info={info("event")} />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-extrabold">🎙️ {t.iphone.siriTitle}</h2>
        <Steps steps={t.iphone.siriSteps} />
        <p className="mt-3 text-sm text-muted">{t.iphone.siriHebrew}</p>
        <p className="mt-2 text-sm text-muted">🤝 {t.iphone.siriCommit}</p>
        <div className="mt-4 space-y-3">
          <CopyField label={t.iphone.shortcutName} value={t.iphone.siriPhrase} />
          <CopyField label={t.iphone.captureUrl} value={`${origin}/api/hooks/capture`} />
          <HookKeyField purpose="capture" info={info("capture")} />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-extrabold">💸 {t.iphone.spendTitle}</h2>
        <Steps steps={t.iphone.spendSteps} />
        <div className="mt-4 space-y-3">
          <CopyField label={t.iphone.spendUrl} value={`${origin}/api/hooks/spend`} />
          <HookKeyField purpose="spend" info={info("spend")} />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-extrabold">🛒 {t.iphone.storeTitle}</h2>
        <Steps steps={t.iphone.storeSteps} />
        <div className="mt-4 space-y-2">
          <CopyField label={t.iphone.storeUrl} value={`${origin}/api/hooks/event?type=arrive_store`} />
          <p className="text-xs text-muted">{fill(t.keys.inSetup, { name: t.keys.names.event })}</p>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-extrabold">⏰ {t.iphone.alarmTitle}</h2>
        <Steps steps={t.iphone.alarmSteps} />
        <div className="mt-4">
          <CopyField label={t.iphone.shortcutName} value={ALARM_SHORTCUT_NAME} />
        </div>
        <a href={alarmShortcutUrl("07:00", "Home Brain test")} className="mt-4 flex h-11 items-center justify-center rounded-2xl bg-sunken font-semibold">
          ▶︎ Test: 07:00
        </a>
      </Card>

      <div className="mt-4">
        <NotesSyncHelp keyInfo={info("notes")} defaultOpen />
      </div>

      <Card className="mt-4 space-y-3">
        <h2 className="text-lg font-extrabold">🔑 {t.keys.otherTitle}</h2>
        {(["checkin", "fridge"] as const).map((purpose) => (
          <div key={purpose} className="space-y-1.5">
            <p className="px-1 text-sm font-semibold">{t.keys.names[purpose]}</p>
            <HookKeyField purpose={purpose} info={info(purpose)} />
          </div>
        ))}
      </Card>
    </div>
  );
}
