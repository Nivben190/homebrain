import { describe, expect, it } from "vitest";
import { localeFromAcceptLanguage } from "./locale";

describe("language from the phone", () => {
  it("a Hebrew phone gets Hebrew, an English or other phone English", () => {
    expect(localeFromAcceptLanguage("he-IL,he;q=0.9,en-US;q=0.8")).toBe("he");
    expect(localeFromAcceptLanguage("iw")).toBe("he");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,he;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("ru-RU,ru;q=0.9,he;q=0.8")).toBe("he");
    expect(localeFromAcceptLanguage("fr-FR")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });

  it("weights win over order", () => {
    expect(localeFromAcceptLanguage("en;q=0.5,he;q=0.9")).toBe("he");
  });
});
