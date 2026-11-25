import { ShieldCheck, Clock3, PhoneCall } from "lucide-react";
import { getLang, getTr } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/messages";
import { listStations, getSetting } from "@/lib/domain/workflow";
import { Notice } from "@/components/ui";
import { ComplaintForm } from "@/components/online/complaint-form";

export async function generateMetadata() {
  const tr = await getTr();
  return { title: tr("File a complaint online") };
}

export default async function ComplaintPage() {
  const tr = await getTr();
  const lang = await getLang();
  const stations = listStations();
  const types = getSetting("incident.types");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900 sm:text-3xl">{tr("File a complaint online")}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-7 text-slate-600">
          {tr("Tell the police station what happened. You will get a tracking code to check the status of your complaint.")}
        </p>
        <Notice tone="amber" className="mt-5" title={tr("This is a complaint submission, not a registered FIR.")}>
          {tr("Police staff will verify it and contact you.")}
        </Notice>
        <div className="mt-6">
          <ComplaintForm
            stations={stations.map((s) => ({ id: s.id, name: s.name }))}
            incidentTypes={types.map((t) => ({ value: t, label: tr(t as MsgKey) }))}
            language={lang}
          />
        </div>
      </div>
      <aside className="space-y-4 lg:pt-14">
        {[
          { icon: <ShieldCheck className="h-5 w-5" />, title: tr("Verified by staff"), body: tr("A police officer reviews every complaint before any action is taken.") },
          { icon: <Clock3 className="h-5 w-5" />, title: tr("Track progress"), body: tr("Use your tracking code and phone number to see the current status.") },
          { icon: <PhoneCall className="h-5 w-5" />, title: tr("Emergency?"), body: tr("Do not use this form. Call 112 immediately.") },
        ].map((p) => (
          <div key={p.title} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-navy-800">
              <span aria-hidden>{p.icon}</span>
              <p className="text-sm font-semibold">{p.title}</p>
            </div>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">{p.body}</p>
          </div>
        ))}
      </aside>
    </div>
  );
}
