import { createHash } from "node:crypto";
import { canAccessWdoCompliance } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import type { CaliforniaWdoActivityExportRecord } from "@/lib/wdo/california/types";
import { californiaWdoTxtBytes } from "@/lib/wdo/california/txt-serializer";

type DownloadRouteProps = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, { params }: DownloadRouteProps) {
  const { batchId } = await params;
  const { supabase, organization, membership } = await getCurrentContext();
  if (!canAccessWdoCompliance(membership.role)) return new Response("Not found", { status: 404 });
  const [{ data: batch, error: batchError }, { data: items, error: itemError }] = await Promise.all([
    supabase
      .from("wdo_export_batches")
      .select("filename, file_checksum_sha256, number_of_activities")
      .eq("organization_id", organization.id)
      .eq("id", batchId)
      .maybeSingle(),
    supabase
      .from("wdo_export_batch_items")
      .select("line_number, normalized_record")
      .eq("organization_id", organization.id)
      .eq("export_batch_id", batchId)
      .order("line_number"),
  ]);
  if (batchError || itemError || !batch) return new Response("WDO export batch not found.", { status: 404 });
  if ((items?.length ?? 0) !== batch.number_of_activities) {
    return new Response("WDO batch item count does not match its immutable audit record.", { status: 409 });
  }
  const records = (items ?? []).map(
    (item) => item.normalized_record as unknown as CaliforniaWdoActivityExportRecord,
  );
  const bytes = californiaWdoTxtBytes(records);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (checksum !== batch.file_checksum_sha256) {
    return new Response("WDO batch checksum verification failed.", { status: 409 });
  }
  const safeFilename = batch.filename.replace(/[\r\n"\\/]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Content-Length": String(bytes.length),
      "Content-Type": "text/plain; charset=us-ascii",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
