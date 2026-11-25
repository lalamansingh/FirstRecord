import Link from "next/link";
import { ShieldX } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { getTr } from "@/lib/i18n/server";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("Access denied") };
}

export default async function AccessDenied() {
  const tr = await getTr();
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <ShieldX className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">{tr("You don't have access to this page")}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {tr("Your role does not include the permission required here. If you need access, ask your station administrator.")}
        </p>
        <Link href="/" className={`${buttonClass("primary")} mt-5`}>{tr("Back to overview")}</Link>
      </div>
    </main>
  );
}
