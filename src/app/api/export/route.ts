/**
 * Aggregate CSV export. analytics.export only. Requires a stated purpose,
 * writes an audit event and an access record, and contains counts only —
 * no names of parties, no statement text.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, requestIp } from "@/lib/auth/session";
import { can } from "@/lib/rbac/access";
import { audit, recordAccess } from "@/lib/audit";
import { assertSameOrigin, errorResponse, rateLimit } from "@/lib/http";
import { AppError, ForbiddenError, UnauthenticatedError, ValidationError } from "@/lib/errors";
import { EXPORT_DATASETS, EXPORT_PURPOSES, exportRows, sanitizeFilters, toCsv, type ExportDataset } from "@/lib/domain/analytics";
import { newId } from "@/lib/db";

const schema = z
  .object({
    dataset: z.enum(Object.keys(EXPORT_DATASETS) as [ExportDataset, ...ExportDataset[]]),
    purpose: z.enum(Object.keys(EXPORT_PURPOSES) as [string, ...string[]]),
    purposeNote: z.string().trim().max(300).optional().default(""),
    confirm: z.literal("yes", { message: "Confirm that the export is for an authorized purpose." }),
  })
  .refine((v) => v.purpose !== "other" || v.purposeNote.length >= 5, { message: "Describe the purpose (at least 5 characters).", path: ["purposeNote"] });

export async function GET() {
  return NextResponse.json({ error: "Use the export form on the Reports & Analytics page (POST with a stated purpose)." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getCurrentUser();
    if (!user) throw new UnauthenticatedError();
    if (!can(user, "analytics.export")) throw new ForbiddenError("Your role cannot export reports.");
    if (!rateLimit(`export:${user.id}`, 20, 60 * 60 * 1000)) throw new AppError("Export limit reached. Try again later.", 429);

    const fd = await req.formData();
    const get = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : undefined);
    const parsed = schema.safeParse({ dataset: get("dataset"), purpose: get("purpose"), purposeNote: get("purposeNote"), confirm: get("confirm") });
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid export request.");
    const { dataset, purpose, purposeNote } = parsed.data;
    const filters = sanitizeFilters(user, { from: get("from"), to: get("to"), status: get("status"), stationId: get("stationId"), officerId: get("officerId") });

    const rows = exportRows(user, dataset, filters);
    const csv =
      `# FirstRecord aggregate export — ${EXPORT_DATASETS[dataset]} — generated ${new Date().toISOString()} by ${user.email}\r\n` +
      `# Aggregate counts only. Contains no statement content or party details. Handle per your organization's data policy.\r\n` +
      toCsv(rows) + "\r\n";

    const ip = await requestIp();
    const exportId = newId();
    audit({
      actorId: user.id,
      action: "analytics.exported",
      entityType: "analytics_export",
      entityId: exportId,
      summary: `Exported "${EXPORT_DATASETS[dataset]}" (${rows.length - 1} rows) — purpose: ${EXPORT_PURPOSES[purpose as keyof typeof EXPORT_PURPOSES]}`,
      metadata: { dataset, purpose, purposeNote: purposeNote.slice(0, 200), filters, rowCount: rows.length - 1 },
      ip,
    });
    recordAccess({ userId: user.id, entityType: "analytics_export", entityId: exportId, action: "export", ip });

    const filename = `firstrecord-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
