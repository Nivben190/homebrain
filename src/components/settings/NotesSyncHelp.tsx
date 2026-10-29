"use client";
import { useI18n } from "@/i18n/client";
import { NOTES_SHORTCUT_NAME } from "@/lib/engine/render";
import { CopyField } from "./CopyField";
import { HookKeyField, KeyHint, type KeyInfo } from "./HookKey";

/** iCloud link of a working "Brain Notes Sync" Shortcut, once someone shares one. */
const SHARED_SHORTCUT = process.env.NEXT_PUBLIC_NOTES_SHORTCUT_LINK;

/** How the 🔄 button works + the Shortcut (one tap if shared, else build steps). */
export function NotesSyncHelp({ keyInfo, defaultOpen = false }: { keyInfo?: KeyInfo; defaultOpen?: boolean }) {
  const { t } = useI18n();
  const n = t.notesSync;
  return (
    <details className="rounded-2xl bg-sunken p-3" open={defaultOpen}>
      <summary className="cursor-pointer font-semibold">{n.title}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm">{n.hint}</p>
        <p className="text-xs text-muted">{n.limit}</p>
        <p className="text-xs text-muted">{n.returnTip}</p>
        {SHARED_SHORTCUT && (
          <a href={SHARED_SHORTCUT} className="flex h-12 items-center justify-center rounded-2xl bg-accent font-bold text-accent-fg">
            ➕ {n.addShortcut}
          </a>
        )}
        <p className="text-sm font-bold">{SHARED_SHORTCUT ? n.orBuild : n.setupTitle}</p>
        <ol className="space-y-1.5 text-sm">
          {n.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-bold text-accent">{i + 1}.</span> {step}
            </li>
          ))}
        </ol>
        <CopyField label={n.shortcutName} value={NOTES_SHORTCUT_NAME} />
        <CopyField label={n.yourUrl} value={typeof window === "undefined" ? "" : `${window.location.origin}/api/hooks/notes`} />
        {keyInfo ? <HookKeyField purpose="notes" info={keyInfo} /> : <KeyHint purpose="notes" />}
        <p className="text-xs text-muted">{n.shareTip}</p>
      </div>
    </details>
  );
}
