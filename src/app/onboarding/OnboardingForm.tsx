"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Home, Users } from "lucide-react";
import { setupHome } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Button, Card, EmojiPicker, Field, Input, Segmented, Toggle } from "@/components/ui";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { DEFAULT_HOME, HOUSEHOLD_KINDS, type HouseholdKind } from "@/lib/home-shape";

export function OnboardingForm({ defaultName, invite }: { defaultName: string; invite?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">(invite ? "join" : "create");
  const [displayName, setDisplayName] = useState(defaultName);
  const [emoji, setEmoji] = useState("😎");
  const [phone, setPhone] = useState("");
  const [homeName, setHomeName] = useState("");
  const [inviteCode, setInviteCode] = useState(invite ?? "");
  const [starter, setStarter] = useState(true);
  const [who, setWho] = useState<HouseholdKind>(DEFAULT_HOME.who);
  const [dog, setDog] = useState(DEFAULT_HOME.dog);
  const [kids, setKids] = useState(DEFAULT_HOME.kids);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await setupHome({
        mode,
        homeName,
        inviteCode,
        starter,
        home: { who, dog, kids },
        displayName,
        emoji,
        phone,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!res.ok) return setError(res.error);
      // A new home goes on to pick its first spaces; a joiner's home already has them.
      router.replace(mode === "create" ? "/sections?find=1" : "/");
      router.refresh();
    });
  }

  return (
    <main className="safe-top mx-auto max-w-md px-5 pb-16">
      <div className="flex justify-end">
        <LanguageSwitch />
      </div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 text-[34px] font-extrabold leading-tight tracking-tight">
        {t.onboarding.title} <span className="inline-block">✨</span>
      </motion.h1>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-3xl">{emoji}</span>
            <div className="flex-1">
              <Field label={t.onboarding.name}>
                <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </Field>
            </div>
          </div>
          <Field label={t.onboarding.emoji}>
            <EmojiPicker value={emoji} onChange={setEmoji} />
          </Field>
          <Field label={t.onboarding.phone}>
            <Input type="tel" inputMode="tel" placeholder="050-000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </Card>

        {!invite && (
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "create", label: <span className="inline-flex items-center gap-1.5"><Home className="size-4" />{t.onboarding.createTitle}</span> },
            { value: "join", label: <span className="inline-flex items-center gap-1.5"><Users className="size-4" />{t.onboarding.joinTitle}</span> },
          ]}
        />
        )}

        <Card className="space-y-4">
          {mode === "create" ? (
            <Field label={t.onboarding.homeName}>
              <Input value={homeName} placeholder={t.onboarding.homeNamePlaceholder} onChange={(e) => setHomeName(e.target.value)} />
            </Field>
          ) : invite ? null : (
            <Field label={t.onboarding.inviteCode} hint={t.onboarding.joinHint}>
              <Input required value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} className="text-center font-mono text-xl tracking-[0.3em]" maxLength={8} />
            </Field>
          )}
          {mode === "create" && (
            <>
              <Field label={t.onboarding.who}>
                <div className="grid grid-cols-2 gap-2">
                  {HOUSEHOLD_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={who === k}
                      onClick={() => {
                        setWho(k);
                        if (k === "family") setKids(true);
                      }}
                      className={who === k ? "rounded-2xl bg-accent px-3 py-2.5 text-sm font-bold text-white" : "rounded-2xl bg-sunken px-3 py-2.5 text-sm font-semibold"}
                    >
                      {t.onboarding.kinds[k]}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[15px] leading-snug">{t.onboarding.dog}</span>
                <Toggle checked={dog} onChange={setDog} label={t.onboarding.dog} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[15px] leading-snug">{t.onboarding.kids}</span>
                <Toggle checked={kids} onChange={setKids} label={t.onboarding.kids} />
              </div>
            </>
          )}
          <div className="flex items-center justify-between gap-4">
            <span className="text-[15px] leading-snug">{mode === "create" ? t.onboarding.starter : t.onboarding.starterJoin}</span>
            <Toggle checked={starter} onChange={setStarter} />
          </div>
        </Card>

        {error && <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}
        <Button size="lg" className="w-full" loading={pending}>
          {mode === "create" ? t.onboarding.start : t.onboarding.join} 🚀
        </Button>
      </form>
    </main>
  );
}
