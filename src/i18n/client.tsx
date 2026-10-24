"use client";
import { createContext, useContext } from "react";
import type { Dict, Locale } from "./index";

const I18nContext = createContext<{ t: Dict; locale: Locale } | null>(null);

export function I18nProvider({ t, locale, children }: { t: Dict; locale: Locale; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ t, locale }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
