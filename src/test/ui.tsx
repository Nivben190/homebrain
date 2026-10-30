import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { getDict, type Locale } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { Toaster } from "@/components/Toaster";

afterEach(cleanup);

/** Renders a client component the way the app does: inside the language and toast providers. */
export function renderUi(ui: React.ReactElement, locale: Locale = "en") {
  const user = userEvent.setup();
  const t = getDict(locale);
  return {
    user,
    t,
    ...render(
      <I18nProvider t={t} locale={locale}>
        <Toaster>{ui}</Toaster>
      </I18nProvider>,
    ),
  };
}
