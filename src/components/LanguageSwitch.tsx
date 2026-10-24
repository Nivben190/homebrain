"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions";
import { useI18n } from "@/i18n/client";
import { Segmented } from "./ui";
import type { Locale } from "@/i18n";

export function LanguageSwitch() {
  const { locale } = useI18n();
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div className="w-32">
      <Segmented<Locale>
        value={locale}
        options={[
          { value: "en", label: "EN" },
          { value: "he", label: "עב" },
        ]}
        onChange={(v) =>
          start(async () => {
            await setLocale(v);
            router.refresh();
          })
        }
      />
    </div>
  );
}
