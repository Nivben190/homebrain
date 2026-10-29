"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui";

/** Reloads the status lights after running a Shortcut once. */
export function RecheckButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="soft" className="mt-3" loading={pending} onClick={() => start(() => router.refresh())}>
      <RefreshCw className="size-4" /> {t.iphone.recheck}
    </Button>
  );
}
