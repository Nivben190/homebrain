import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireHome, getT } from "@/lib/session";
import { appOrigin } from "@/lib/url";
import { Card } from "@/components/ui";
import { CopyField } from "@/components/settings/CopyField";
import { NotesSyncHelp } from "@/components/settings/NotesSyncHelp";
import { ALARM_SHORTCUT_NAME, alarmShortcutUrl } from "@/lib/engine/render";

export default async function IphonePage() {
  const { profile } = await requireHome();
  const t = await getT();
  const captureUrl = `${await appOrigin()}/api/hooks/capture?token=${profile.hook_token}`;
  const hookUrl = `${await appOrigin()}/api/hooks/event?type=wake&token=${profile.hook_token}`;

  return (
    <div className="safe-top">
      <Link href="/me" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft className="size-4 rtl:rotate-180" /> {t.settings.title}
      </Link>
      <h1 className="text-[30px] font-extrabold tracking-tight">📱 {t.iphone.title}</h1>
      <p className="mt-1 text-muted">{t.iphone.intro}</p>

      <Card className="mt-6">
        <h2 className="mb-3 text-lg font-extrabold">☀️ {t.iphone.wakeTitle}</h2>
        <ol className="space-y-2">
          {t.iphone.wakeSteps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
              <span className="text-[15px]">{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <CopyField label={t.iphone.hookUrl} value={hookUrl} hint={t.iphone.keepSecret} />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-extrabold">🎙️ {t.iphone.siriTitle}</h2>
        <ol className="space-y-2">
          {t.iphone.siriSteps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
              <span className="text-[15px]">{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted">{t.iphone.siriHebrew}</p>
        <p className="mt-2 text-sm text-muted">🤝 {t.iphone.siriCommit}</p>
        <div className="mt-4 space-y-3">
          <CopyField label={t.iphone.shortcutName} value={t.iphone.siriPhrase} />
          <CopyField label={t.iphone.captureUrl} value={captureUrl} hint={t.iphone.keepSecret} />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-extrabold">🛒 {t.iphone.storeTitle}</h2>
        <ol className="space-y-2">
          {t.iphone.storeSteps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
              <span className="text-[15px]">{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <CopyField label={t.iphone.storeUrl} value={hookUrl.replace("type=wake", "type=arrive_store")} hint={t.iphone.keepSecret} />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-extrabold">⏰ {t.iphone.alarmTitle}</h2>
        <ol className="space-y-2">
          {t.iphone.alarmSteps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
              <span className="text-[15px]">{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <CopyField label={t.iphone.shortcutName} value={ALARM_SHORTCUT_NAME} />
        </div>
        <a href={alarmShortcutUrl("07:00", "Home Brain test")} className="mt-4 flex h-11 items-center justify-center rounded-2xl bg-sunken font-semibold">
          ▶︎ Test: 07:00
        </a>
      </Card>

      <div className="mt-4">
        <NotesSyncHelp hookToken={profile.hook_token} defaultOpen />
      </div>
    </div>
  );
}
