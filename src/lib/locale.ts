// First open, before anyone chose a language: follow the phone.
import type { Locale } from "@/i18n";

/** "he-IL,he;q=0.9,en;q=0.8" → "he". Hebrew (or the old "iw") anywhere before English wins; otherwise English. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  const tags = (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q) };
    })
    .filter((x) => x.lang && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  const first = tags.find((x) => x.lang === "he" || x.lang === "iw" || x.lang === "en");
  return first && first.lang !== "en" ? "he" : "en";
}
