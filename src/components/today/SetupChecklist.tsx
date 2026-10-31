"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { fill } from "@/i18n";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { InviteLinkButton } from "@/components/InviteLinkButton";
import { enablePush, getPushState, isStandalone } from "@/lib/push-client";

const DISMISSED = "setup-dismissed";

export type SetupStep = "install" | "push" | "partner" | "routine" | "shortcut";
export const SETUP_STEPS: SetupStep[] = ["install", "push", "partner", "routine", "shortcut"];

/**
 * "Get set up · 2 of 5" on Today: the things that make the app click, each ticking
 * itself off. The server knows push, partner, routine and Shortcut; this phone knows
 * whether it runs from the Home Screen. Gone at 5 of 5, or when hidden.
 */
export function SetupChecklist({ done: serverDone, fewSpaces }: { done: Partial<Record<SetupStep, boolean>>; fewSpaces: boolean }) {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [pushOn, setPushOn] = useState(!!serverDone.push);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(DISMISSED) === "1");
    } catch {
      setHidden(false);
    }
    // A desktop browser has no Home Screen; count it as done there.
    setInstalled(isStandalone() || !/iPad|iPhone|iPod|Android/.test(navigator.userAgent));
    getPushState().then((s) => s === "granted" && setPushOn(true));
    setReady(true);
  }, []);

  const done: Record<SetupStep, boolean> = { install: installed, push: pushOn, partner: !!serverDone.partner, routine: !!serverDone.routine, shortcut: !!serverDone.shortcut };
  const count = SETUP_STEPS.filter((s) => done[s]).length;
  if (!ready || hidden || count === SETUP_STEPS.length) return null;
  const next = SETUP_STEPS.find((s) => !done[s]);

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Private mode: hidden for this visit only.
    }
  }

  async function turnOnPush() {
    setBusy(true);
    setPushOn((await enablePush()) === "granted");
    setBusy(false);
  }

  return (
    <div className="glass relative mt-4 rounded-3xl p-4">
      <button type="button" onClick={hide} aria-label={t.setup.hide} className="absolute end-3 top-3 text-muted">
        <X className="size-4" />
      </button>
      <p className="pe-6 font-bold">{fill(t.setup.title, { n: String(count), total: String(SETUP_STEPS.length) })}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(count / SETUP_STEPS.length) * 100}%` }} />
      </div>
      <ul className="mt-3 space-y-2">
        {SETUP_STEPS.map((step) => (
          <li key={step}>
            <div className="flex items-center gap-3">
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", done[step] ? "bg-success text-white" : "border-2 border-faint-deco")}>
                {done[step] && <Check className="size-3.5" strokeWidth={3.5} />}
              </span>
              <span className={cn("flex-1 text-sm font-semibold", done[step] && "text-muted line-through")}>{t.setup.steps[step]}</span>
            </div>
            {step === "push" && !done.push && (installed || step === next) && (
              <div className="ms-9 mt-2">
                <Button size="sm" loading={busy} onClick={turnOnPush}>
                  {t.settings.enable}
                </Button>
              </div>
            )}
            {step === next && step !== "push" && (
              <div className="ms-9 mt-2">
                {step === "install" && <p className="text-sm text-muted">{t.today.installHint}</p>}
                {step === "partner" && <InviteLinkButton />}
                {step === "routine" && (
                  <Link href={fewSpaces ? "/sections?find=1" : "/sections"} className="text-sm font-bold text-accent">
                    {fewSpaces ? t.finder.bannerCta : t.setup.openSpaces} →
                  </Link>
                )}
                {step === "shortcut" && (
                  <Link href="/me/iphone" className="text-sm font-bold text-accent">
                    {t.setup.openIphone} →
                  </Link>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
