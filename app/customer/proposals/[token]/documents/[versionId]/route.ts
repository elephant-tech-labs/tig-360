import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashReviewToken } from "@/lib/proposals/review-links";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; versionId: string }> },
) {
  const { token, versionId } = await params;
  const supabase = createAdminClient();
  const { data: link } = await supabase
    .from("proposal_review_links")
    .select("organization_id, report_document_version_id, proposal_document_version_id, status, expires_at")
    .eq("token_hash", hashReviewToken(token))
    .single();
  if (!link || link.status !== "active" || new Date(link.expires_at).getTime() < Date.now()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (![link.report_document_version_id, link.proposal_document_version_id].includes(versionId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: version } = await supabase
    .from("document_versions")
    .select("id, assets(provider_file_id, original_filename, content_type)")
    .eq("id", versionId)
    .eq("organization_id", link.organization_id)
    .single();
  const asset = version ? (Array.isArray(version.assets) ? version.assets[0] : version.assets) : null;
  if (!asset?.provider_file_id) return new NextResponse("Not found", { status: 404 });

  const { data: pdf } = await supabase.storage.from("report-pdfs").download(asset.provider_file_id);
  if (!pdf) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": asset.content_type || "application/pdf",
      "Content-Disposition": `attachment; filename="${asset.original_filename || "document.pdf"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
