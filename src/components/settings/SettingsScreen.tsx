"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, Calendar, ChevronRight, Copy, LogOut, Mail, Smartphone } from "lucide-react";
import { disconnectCalendar, sendTestPush, signOut, updateProfile } from "@/app/actions";
import { enablePush, getPushState, type PushState } from "@/lib/push-client";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Button, Card, EmojiPicker, Field, Input, PageHeader, SectionTitle, Select, Sheet } from "@/components/ui";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import type { Member } from "@/components/sections/PropertyInput";
import type { Profile } from "@/lib/db-types";
import { DailyBrainSettings, type DailyPrefs } from "./DailyBrainSettings";
import { BrainStatusCard, type BrainStatus } from "./BrainStatusCard";
import { PushDevicesCard, type PushDevice } from "./PushDevicesCard";
import { YourDataCard } from "./YourDataCard";
import { useToast } from "@/components/Toaster";
import { errorKey } from "@/lib/errors";
import { InviteLinkButton } from "@/components/InviteLinkButton";
import { MembersCard, type HomeMember } from "./MembersCard";

type ProfileForm = Pick<Profile, "display_name" | "emoji" | "timezone" | "wake_mode"> & { phone: string; wake_time: string; email: string };

export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    },
  };
}

export function SettingsScreen({
  profile,
  household,
  members,
  feedUrl,
  daily,
  gmail,
  gcal,
  brain,
  partners,
  roster,
  userId,
  spaces,
  devices = [],
}: {
  profile: ProfileForm;
  household: { name: string; invite_code: string | null }; // null: only owners and adults invite
  members: Member[];
  feedUrl: string;
  daily: DailyPrefs;
  gmail: { sectionId: string; email: string | null; expired: boolean; space: string }[];
  gcal: { email: string | null; expired: boolean } | null;
  brain: BrainStatus;
  partners: string[];
  roster: HomeMember[];
  userId: string;
  spaces: { id: string; icon: string; title: string }[];
  devices?: PushDevice[];
}) {
  const { t } = useI18n();
  const [p, setP] = useState(profile);
  const [emojiSheet, setEmojiSheet] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const { copied, copy } = useCopy();
  const timezones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [p.timezone]), [p.timezone]);

  useEffect(() => {
    getPushState().then(setPush);
  }, []);

  const flash = (ok: boolean, error?: string) => (ok ? toast.success(t.settings.saved) : toast.error(t.failures[errorKey(error)]));

  const save = (patch: Partial<ProfileForm>) => {
    const next = { ...p, ...patch };
    setP(next);
    start(async () => {
      const res = await updateProfile({
        display_name: next.display_name,
        emoji: next.emoji,
        phone: next.phone || null,
        timezone: next.timezone,
        wake_mode: next.wake_mode,
        wake_time: next.wake_mode === "fixed" ? next.wake_time : null,
      });
      flash(res.ok, res.ok ? undefined : res.error);
    });
  };

  return (
    <>
      <PageHeader title={t.settings.title} action={<LanguageSwitch />} />

      <Card className="flex items-center gap-4">
        <button onClick={() => setEmojiSheet(true)} aria-label={t.onboarding.emoji} className="flex size-16 shrink-0 items-center justify-center rounded-[1.4rem] bg-accent-soft text-4xl transition active:scale-90">
          {p.emoji}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <Input aria-label={t.onboarding.name} value={p.display_name} onChange={(e) => setP({ ...p, display_name: e.target.value })} onBlur={() => save({})} className="h-11 font-bold" />
          <p className="truncate px-1 text-sm text-muted">{p.email}</p>
        </div>
      </Card>

      <SectionTitle>{t.settings.profile}</SectionTitle>
      <Card className="space-y-4">
        <Field label={t.onboarding.phone}>
          <Input type="tel" inputMode="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} onBlur={() => save({})} />
        </Field>
        <Field label={t.settings.timezone}>
          <Select value={p.timezone} onChange={(e) => save({ timezone: e.target.value })}>
            {timezones.map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </Select>
        </Field>
        <Field label={t.settings.wakeMode}>
          <div className="space-y-2">
            {(["shortcut", "fixed", "first_open"] as const).map((m) => (
              <label key={m} className="flex items-center gap-3 rounded-2xl bg-sunken px-4 py-3">
                <input type="radio" name="wake" checked={p.wake_mode === m} onChange={() => save({ wake_mode: m })} className="size-5 accent-[var(--accent)]" />
                <span className="font-medium">{t.settings[`wake_${m}`]}</span>
              </label>
            ))}
            {p.wake_mode === "fixed" && <Input type="time" value={p.wake_time} onChange={(e) => setP({ ...p, wake_time: e.target.value })} onBlur={() => save({})} />}
          </div>
        </Field>
      </Card>

      <DailyBrainSettings initial={daily} spaces={spaces} />

      <SectionTitle>{t.settings.notifications}</SectionTitle>
      <Card className="flex items-center gap-3">
        <BellRing className="size-6 text-accent" />
        <div className="flex-1">
          <p className="font-semibold">{t.settings.thisDevice}</p>
          <p className="text-sm text-muted">{push === "granted" ? t.settings.enabled : push === "needs-install" ? t.today.installHint : push === "denied" ? "⛔" : t.today.enablePushHint}</p>
        </div>
        {push === "granted" ? (
          <Button size="sm" variant="soft" onClick={async () => { const r = await sendTestPush(); if (r.ok) toast.success("🔔"); else toast.error(r.error ?? t.failures.generic); }}>
            {t.settings.testPush}
          </Button>
        ) : (
          push === "default" && (
            <Button size="sm" onClick={async () => setPush(await enablePush())}>
              {t.settings.enable}
            </Button>
          )
        )}
      </Card>

      <PushDevicesCard devices={devices} />

      <div className="mt-3">
        <BrainStatusCard status={brain} />
      </div>

      <SectionTitle>{t.settings.household}</SectionTitle>
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <span className="text-lg font-bold">{household.name}</span>
          <span className="ms-auto flex -space-x-2 rtl:space-x-reverse">
            {members.map((m) => (
              <span key={m.id} title={m.name} className="flex size-9 items-center justify-center rounded-full border-2 border-card-solid bg-accent-soft text-lg">
                {m.emoji}
              </span>
            ))}
          </span>
        </div>
        {household.invite_code && (
          <>
            <Field label={t.settings.invite} hint={t.settings.inviteHint}>
              <button onClick={() => copy("invite", household.invite_code!)} className="flex h-14 w-full items-center justify-between rounded-2xl bg-sunken px-4 font-mono text-2xl font-bold tracking-[0.3em]">
                {household.invite_code}
                <span className="font-sans text-sm font-semibold tracking-normal text-accent">{copied === "invite" ? t.common.copied : <Copy className="size-5" />}</span>
              </button>
            </Field>
            <InviteLinkButton />
          </>
        )}
        <MembersCard members={roster} userId={userId} />
      </Card>

      <Link href="/home-info" className="glass mt-3 flex items-center gap-3 rounded-3xl p-4">
        <span className="text-2xl">🏠</span>
        <span className="flex-1">
          <span className="block font-semibold">{t.homeInfo.title}</span>
          <span className="block text-sm text-muted">{t.homeInfo.link}</span>
        </span>
        <ChevronRight className="size-5 text-faint rtl:rotate-180" />
      </Link>

      <SectionTitle>{t.settings.iphone}</SectionTitle>
      <Link href="/me/iphone" className="glass flex items-center gap-3 rounded-3xl p-4">
        <Smartphone className="size-6 text-accent" />
        <span className="flex-1">
          <span className="block font-semibold">{t.iphone.title}</span>
          <span className="block text-sm text-muted">{t.settings.iphoneHint}</span>
        </span>
        <ChevronRight className="size-5 text-faint rtl:rotate-180" />
      </Link>

      <SectionTitle>{t.settings.calendar}</SectionTitle>
      <Card className="space-y-3">
        <div className="flex gap-3">
          <Calendar className="size-6 shrink-0 text-accent" />
          <p className="text-sm text-muted">{t.settings.calendarHint}</p>
        </div>
        <a href={feedUrl.replace(/^https?:/, "webcal:")} className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-accent-fg">
          🍎 {t.settings.subscribeApple}
        </a>
        <button onClick={() => copy("feed", feedUrl)} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sunken font-semibold">
          📅 Google · {copied === "feed" ? t.common.copied : t.settings.feedUrl}
        </button>
      </Card>

      <GoogleCalendarCard gcal={gcal} />

      {gmail.length > 0 && (
        <>
          <SectionTitle>{t.subs.gmailTitle}</SectionTitle>
          <div className="glass divide-y divide-card-border overflow-hidden rounded-3xl">
            {gmail.map((g) => (
              <Link key={g.sectionId} href={`/sections/${g.sectionId}`} className="flex items-center gap-3 p-4">
                <Mail className="size-5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{g.email}</span>
                  <span className={g.expired ? "block truncate text-sm text-warn" : "block truncate text-sm text-muted"}>{g.expired ? t.subs.expired : g.space}</span>
                </span>
                <ChevronRight className="size-5 text-faint rtl:rotate-180" />
              </Link>
            ))}
          </div>
        </>
      )}

      <YourDataCard email={p.email} partners={partners} />

      <form action={signOut} className="mt-8">
        <Button variant="ghost" className="w-full">
          <LogOut className="size-4 rtl:rotate-180" /> {t.settings.signOut}
        </Button>
      </form>


      <Sheet open={emojiSheet} onClose={() => setEmojiSheet(false)} title={t.onboarding.emoji}>
        <div className="pb-4">
          <EmojiPicker
            value={p.emoji}
            onChange={(emoji) => {
              setEmojiSheet(false);
              save({ emoji });
            }}
          />
        </div>
      </Sheet>
    </>
  );
}

function GoogleCalendarCard({ gcal }: { gcal: { email: string | null; expired: boolean } | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const result = params.get("calendar");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="space-y-3">
      <div className="flex gap-3">
        <span className="text-2xl">📅</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.settings.gcalTitle}</p>
          <p className={gcal?.expired ? "text-sm text-warn" : "truncate text-sm text-muted"}>
            {gcal ? (gcal.expired ? t.settings.gcalExpired : fill(t.settings.gcalConnected, { email: gcal.email ?? "" })) : t.settings.gcalHint}
          </p>
        </div>
      </div>
      {result && <p className="text-sm font-semibold text-accent">{t.settings.gcalResult[result] ?? t.settings.gcalResult.failed}</p>}
      {!gcal || gcal.expired ? (
        <a href="/api/google/calendar" className="flex h-11 items-center justify-center rounded-2xl bg-accent font-semibold text-accent-fg">
          {t.settings.gcalConnect}
        </a>
      ) : (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await disconnectCalendar();
            setBusy(false);
            router.replace("/me");
          }}
          className="flex h-11 w-full items-center justify-center rounded-2xl bg-sunken font-semibold"
        >
          {t.settings.gcalDisconnect}
        </button>
      )}
    </Card>
  );
}
