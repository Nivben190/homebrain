import type { Metadata, Viewport } from "next";
import { Heebo, Plus_Jakarta_Sans } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { dirFor, getDict } from "@/i18n";
import { getLocale } from "@/lib/session";
import { MotionRoot } from "@/components/MotionRoot";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const heebo = Heebo({ variable: "--font-heebo", subsets: ["hebrew", "latin"] });

export const metadata: Metadata = {
  title: "Home Brain",
  description: "Your home, thinking ahead.",
  appleWebApp: { capable: true, title: "Home Brain", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/192", apple: "/icons/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a13" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className={`${jakarta.variable} ${heebo.variable} antialiased`}>
        <div className="aurora" aria-hidden>
          <span />
        </div>
        <I18nProvider t={getDict(locale)} locale={locale}>
          <MotionRoot>{children}</MotionRoot>
        </I18nProvider>
      </body>
    </html>
  );
}
