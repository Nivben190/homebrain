"use client";
import { useState, useTransition } from "react";
import { toggleAutomation } from "@/app/actions";
import { Toggle } from "@/components/ui";

export function AutomationToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [, start] = useTransition();
  return (
    <Toggle
      checked={on}
      onChange={(v) => {
        setOn(v);
        start(() => toggleAutomation(id, v).then(() => undefined));
      }}
    />
  );
}
