"use client";
import { Copy } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Field } from "@/components/ui";
import { useCopy } from "./SettingsScreen";

export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const { t } = useI18n();
  const { copied, copy } = useCopy();
  return (
    <Field label={label} hint={hint}>
      <button type="button" onClick={() => copy("v", value)} className="flex w-full items-center gap-2 rounded-2xl bg-sunken px-4 py-3 text-start">
        <span className="min-w-0 flex-1 truncate font-mono text-xs" dir="ltr">
          {value}
        </span>
        <span className="shrink-0 text-sm font-semibold text-accent">{copied ? t.common.copied : <Copy className="size-4" />}</span>
      </button>
    </Field>
  );
}
