import { en, type Dict } from "./en";
import { he } from "./he";

export type Locale = "en" | "he";
export const LOCALE_COOKIE = "hb_locale";

const dicts: Record<Locale, Dict> = { en, he };

export function getDict(locale: Locale): Dict {
  return dicts[locale] ?? en;
}

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "he" ? "rtl" : "ltr";
}

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "he";
}

export type { Dict };
