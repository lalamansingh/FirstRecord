import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { getUiLang } from "@/lib/i18n/ui-lang";
import { t } from "@/lib/i18n/messages";

export default async function NotFound() {
  const lang = await getUiLang();
  return (
    <main id="main" className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-slate-900">{t(lang, "Not found")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t(lang, "This record does not exist or you do not have access to it.")}</p>
        <Link href="/" className={`${buttonClass("primary")} mt-5`}>{t(lang, "Back to overview")}</Link>
      </div>
    </main>
  );
}
