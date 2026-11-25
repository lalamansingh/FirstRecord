import { getTr } from "@/lib/i18n/server";
import { TrackForm } from "@/components/online/track-form";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("Track a complaint") };
}

export default async function TrackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tr = await getTr();
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code.slice(0, 40) : "";
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900 sm:text-3xl">{tr("Track a complaint")}</h1>
      <p className="mt-2 text-[15px] leading-7 text-slate-600">
        {tr("Enter the tracking code you received and the phone number you gave when you submitted the complaint.")}
      </p>
      <div className="mt-6">
        <TrackForm initialCode={code} />
      </div>
    </div>
  );
}
