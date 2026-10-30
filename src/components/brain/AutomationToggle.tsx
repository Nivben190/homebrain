"use client";
import { useState, useTransition } from "react";
import { toggleAutomation } from "@/app/actions";
import { Toggle } from "@/components/ui";
import { useToast } from "@/components/Toaster";
import { useI18n } from "@/i18n/client";
import { errorKey } from "@/lib/errors";

/** On/off for one automation; a refused change flips back and says why. */
export function AutomationToggle({ id, enabled, name }: { id: string; enabled: boolean; name: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [on, setOn] = useState(enabled);
  const [, start] = useTransition();
  return (
    <Toggle
      checked={on}
      label={name}
      onChange={(v) => {
        setOn(v);
        start(async () => {
          const res = await toggleAutomation(id, v);
          if (res.ok) return;
          setOn(!v);
          toast.error(t.failures[errorKey(res.error)]);
        });
      }}
    />
  );
}
