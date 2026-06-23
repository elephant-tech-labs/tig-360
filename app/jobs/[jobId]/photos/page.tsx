import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { JobAuthoringNav } from "@/components/job-authoring-nav";
import { PhotosWorkspace, type JobPhotoItem } from "@/components/photos-workspace";
import { getCurrentContext } from "@/lib/current-organization";
import { JobWorkspaceHeader } from "@/components/job-workspace-header";
import { getJobWorkflowStates } from "@/lib/job-workflow";

type PhotosPageProps = { params: Promise<{ jobId: string }> };

export default async function PhotosPage({ params }: PhotosPageProps) {
  const { jobId } = await params;
  const { supabase, organization, userName, membership, user } = await getCurrentContext();
  const [
    { data: job, error: jobError },
    { data: photos, error: photosError },
    { data: findings, error: findingsError },
    { data: photoState, error: photoStateError },
  ] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select("id, job_number, report_type, inspected_by_id, properties(street_line_1, city, region, postal_code)")
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("assets")
      .select(`
        id, provider_file_id, original_filename, content_type, size_bytes, caption,
        photo_category, include_in_report, is_cover, sort_order, annotation_json,
        annotated_render_path, location_label, captured_at, created_at,
        evidence_links(finding_id)
      `)
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .in("kind", ["property_photo", "inspection_photo"])
      .neq("status", "archived")
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("findings")
      .select("id, code, title")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .eq("entry_type", "finding")
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("job_photo_states")
      .select("status")
      .eq("inspection_job_id", jobId)
      .maybeSingle(),
  ]);

  if (jobError || !job) notFound();
  if (photosError) throw new Error(photosError.message);
  if (findingsError) throw new Error(findingsError.message);
  if (photoStateError) throw new Error(photoStateError.message);

  if (membership.role === "inspector") {
    const { data: inspector } = await supabase
      .from("inspectors")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("linked_user_id", user.id)
      .maybeSingle();
    if (!inspector || inspector.id !== job.inspected_by_id) notFound();
  }

  const paths = (photos ?? []).flatMap((photo) =>
    [photo.provider_file_id, photo.annotated_render_path].filter(Boolean) as string[],
  );
  const signedUrlMap = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from("inspection-photos")
      .createSignedUrls(paths, 60 * 60 * 4);
    signed?.forEach((item, index) => {
      if (item.signedUrl) signedUrlMap.set(paths[index], item.signedUrl);
    });
  }

  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const photoItems: JobPhotoItem[] = (photos ?? []).map((photo) => ({
    id: photo.id,
    originalPath: photo.provider_file_id,
    originalUrl: signedUrlMap.get(photo.provider_file_id) ?? "",
    annotatedPath: photo.annotated_render_path,
    annotatedUrl: photo.annotated_render_path
      ? signedUrlMap.get(photo.annotated_render_path) ?? null
      : null,
    filename: photo.original_filename,
    contentType: photo.content_type,
    size: photo.size_bytes,
    caption: photo.caption ?? "",
    category: photo.photo_category ?? "inspection",
    includeInReport: photo.include_in_report,
    isCover: photo.is_cover,
    location: photo.location_label ?? "",
    capturedAt: photo.captured_at,
    annotationJson: photo.annotation_json as JobPhotoItem["annotationJson"],
    findingIds: (photo.evidence_links ?? [])
      .map((link) => link.finding_id)
      .filter(Boolean) as string[],
  }));
  const workflowStates = await getJobWorkflowStates(supabase, organization.id, jobId);

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <JobWorkspaceHeader
        jobId={jobId}
        jobNumber={job.job_number}
        address={property?.street_line_1 ?? ""}
        locality={[
          property?.city,
          [property?.region, property?.postal_code].filter(Boolean).join(" "),
        ].filter(Boolean).join(", ")}
        reportType={job.report_type}
      />
      <JobAuthoringNav jobId={jobId} current="photos" states={workflowStates} />
      <PhotosWorkspace
        organizationId={organization.id}
        jobId={jobId}
        jobNumber={job.job_number}
        propertyAddress={[
          property?.street_line_1,
          property?.city,
          property?.region,
          property?.postal_code,
        ].filter(Boolean).join(", ")}
        initialPhotos={photoItems}
        findings={(findings ?? []).map((finding) => ({
          id: finding.id,
          code: finding.code ?? "Finding",
          title: finding.title,
        }))}
        initialStatus={photoState?.status ?? "draft"}
        captureOnly={membership.role === "inspector"}
      />
    </AppShell>
  );
}
