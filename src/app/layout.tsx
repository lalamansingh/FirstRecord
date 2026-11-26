import type { Metadata } from "next";
import {
  IBM_Plex_Sans,
  Poppins,
  Noto_Sans_Devanagari,
  Noto_Sans_Bengali,
  Noto_Sans_Tamil,
  Noto_Sans_Telugu,
  Noto_Sans_Gujarati,
  Noto_Sans_Kannada,
  Noto_Sans_Malayalam,
  Noto_Sans_Gurmukhi,
} from "next/font/google";
import "./globals.css";
import { getUiLang } from "@/lib/i18n/ui-lang";
import { t } from "@/lib/i18n/messages";
import { ToastProvider } from "@/components/forms";

export const metadata: Metadata = {
  title: { default: "FirstRecord", template: "%s · FirstRecord" },
  description: "FirstRecord — case management and statement recording for police stations.",
  robots: { index: false, follow: false },
};

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-poppins", display: "swap" });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600", "700"], variable: "--font-devanagari", display: "swap" });
// Other Indic scripts: not preloaded — the browser fetches a face only when text in that script is rendered.
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "500", "600", "700"], variable: "--font-bengali", display: "swap", preload: false });
const tamil = Noto_Sans_Tamil({ subsets: ["tamil"], weight: ["400", "500", "600", "700"], variable: "--font-tamil", display: "swap", preload: false });
const telugu = Noto_Sans_Telugu({ subsets: ["telugu"], weight: ["400", "500", "600", "700"], variable: "--font-telugu", display: "swap", preload: false });
const gujarati = Noto_Sans_Gujarati({ subsets: ["gujarati"], weight: ["400", "500", "600", "700"], variable: "--font-gujarati", display: "swap", preload: false });
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], weight: ["400", "500", "600", "700"], variable: "--font-kannada", display: "swap", preload: false });
const malayalam = Noto_Sans_Malayalam({ subsets: ["malayalam"], weight: ["400", "500", "600", "700"], variable: "--font-malayalam", display: "swap", preload: false });
const gurmukhi = Noto_Sans_Gurmukhi({ subsets: ["gurmukhi"], weight: ["400", "500", "600", "700"], variable: "--font-gurmukhi", display: "swap", preload: false });
const fontVars = [plex, poppins, devanagari, bengali, tamil, telugu, gujarati, kannada, malayalam, gurmukhi].map((f) => f.variable).join(" ");

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getUiLang();
  return (
    <html lang={lang} className={fontVars}>
      <body className="min-h-screen antialiased">
        <a href="#main" className="skip-link">{t(lang, "Skip to main content")}</a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
