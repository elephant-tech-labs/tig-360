import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string; versionId: string }> },
) {
  const { jobId, versionId } = await context.params;
  const supabase = await createClient();
  const { data: version } = await supabase
    .from("document_versions")
    .select(`
      assets(provider_file_id),
      documents!inner(inspection_job_id)
    `)
    .eq("id", versionId)
    .eq("documents.inspection_job_id", jobId)
    .maybeSingle();

  const asset = Array.isArray(version?.assets) ? version.assets[0] : version?.assets;
  if (!asset?.provider_file_id) {
    return NextResponse.redirect(new URL(`/jobs/${jobId}/review?error=PDF%20file%20not%20found.`, request.url));
  }

  const { data, error } = await supabase.storage
    .from("report-pdfs")
    .createSignedUrl(asset.provider_file_id, 60, { download: true });
  if (error || !data?.signedUrl) {
    return NextResponse.redirect(new URL(`/jobs/${jobId}/review?error=Unable%20to%20download%20the%20PDF.`, request.url));
  }
  return NextResponse.redirect(data.signedUrl);
}
