"use client";
import { useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { rotateHookKey } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { Button } from "@/components/ui";
import type { HookPurpose } from "@/lib/hook-keys";
import { CopyField } from "./CopyField";

export interface KeyInfo {
  exists: boolean;
  lastUsedAt: string | null;
}

export function useWhen() {
  const { locale } = useI18n();
  return (iso: string) => new Date(iso).toLocaleString(locale === "he" ? "he-IL" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** One Shortcut's key: when it was last used, and Create / Replace, which shows the new key once. */
export function HookKeyField({ purpose, info }: { purpose: HookPurpose; info: KeyInfo }) {
  const { t } = useI18n();
  const when = useWhen();
  const [state, setState] = useState(info);
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    if (state.exists && !confirming) return setConfirming(true);
    setBusy(true);
    setError(null);
    const res = await rotateHookKey(purpose);
    setBusy(false);
    setConfirming(false);
    if (!res.ok || !res.key) return setError(res.ok ? t.sections.saveFailed : res.error);
    setFresh(res.key);
    setState({ exists: true, lastUsedAt: null });
  };

  return (
    <div className="space-y-2 rounded-2xl bg-sunken p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{t.keys.label}</span>
          <span className="text-muted"> · {!state.exists ? t.keys.none : state.lastUsedAt ? fill(t.keys.lastUsed, { when: when(state.lastUsedAt) }) : t.keys.neverUsed}</span>
        </span>
        <Button size="sm" variant={state.exists ? "ghost" : "soft"} loading={busy} onClick={make}>
          {state.exists ? t.keys.rotate : t.keys.create}
        </Button>
      </div>
      {confirming && (
        <p role="alert" className="text-xs font-semibold text-warn">
          {t.keys.confirmRotate}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
      {fresh && <CopyField label={t.keys.label} value={fresh} hint={t.keys.shownOnce} />}
      <p className="text-xs text-muted">{t.keys.header}</p>
    </div>
  );
}

/** Where a Shortcut set up elsewhere in the app gets its key. */
export function KeyHint({ purpose }: { purpose: HookPurpose }) {
  const { t } = useI18n();
  return (
    <p className="text-xs text-muted">
      {fill(t.keys.inSetup, { name: t.keys.names[purpose] })}{" "}
      <Link href="/me/iphone" className="font-semibold text-accent underline">
        {t.iphone.title}
      </Link>
    </p>
  );
}
