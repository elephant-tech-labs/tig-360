"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PhotoMutationResult =
  | { ok: true; photoId?: string }
  | { ok: false; message: string };

async function resetPhotoStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  jobId: string,
) {
  return supabase.rpc("set_job_photo_status", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    status_value: "draft",
  });
}

export async function registerJobPhoto(input: {
  organizationId: string;
  jobId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  size: number;
  capturedAt?: string | null;
  location?: string;
}): Promise<PhotoMutationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_job_photo", {
    target_organization_id: input.organizationId,
    target_job_id: input.jobId,
    storage_path: input.storagePath,
    original_name: input.originalName,
    mime_type: input.mimeType,
    file_size: input.size,
    captured_timestamp: input.capturedAt || null,
    photo_location: input.location || null,
  });
  if (error) return { ok: false, message: error.message };
  const { error: statusError } = await resetPhotoStatus(supabase, input.organizationId, input.jobId);
  if (statusError) return { ok: false, message: statusError.message };
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath(`/jobs/${input.jobId}/photos`);
  return { ok: true, photoId: data ?? undefined };
}

export async function updateJobPhoto(input: {
  organizationId: string;
  jobId: string;
  photoId: string;
  caption: string;
  category: string;
  includeInReport: boolean;
  isCover: boolean;
  location: string;
  findingIds: string[];
}): Promise<PhotoMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_job_photo", {
    target_organization_id: input.organizationId,
    target_asset_id: input.photoId,
    photo_caption: input.caption,
    category_value: input.category,
    report_included: input.includeInReport,
    cover_value: input.isCover,
    photo_location: input.location,
    linked_finding_ids: input.findingIds,
  });
  if (error) return { ok: false, message: error.message };
  const { error: statusError } = await resetPhotoStatus(supabase, input.organizationId, input.jobId);
  if (statusError) return { ok: false, message: statusError.message };
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath(`/jobs/${input.jobId}/photos`);
  return { ok: true };
}

export async function savePhotoAnnotation(input: {
  organizationId: string;
  jobId: string;
  photoId: string;
  annotationJson: Record<string, unknown>;
  renderPath: string;
}): Promise<PhotoMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_photo_annotation", {
    target_organization_id: input.organizationId,
    target_asset_id: input.photoId,
    annotation_data: input.annotationJson,
    render_path: input.renderPath,
  });
  if (error) return { ok: false, message: error.message };
  const { error: statusError } = await resetPhotoStatus(supabase, input.organizationId, input.jobId);
  if (statusError) return { ok: false, message: statusError.message };
  revalidatePath(`/jobs/${input.jobId}/photos`);
  return { ok: true };
}

export async function setJobPhotoStatus(input: {
  organizationId: string;
  jobId: string;
  status: "draft" | "capture_in_progress" | "complete" | "not_required";
}): Promise<PhotoMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_job_photo_status", {
    target_organization_id: input.organizationId,
    target_job_id: input.jobId,
    status_value: input.status,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath(`/jobs/${input.jobId}/photos`);
  revalidatePath(`/jobs/${input.jobId}/photos/capture`);
  return { ok: true };
}

export async function archiveJobPhoto(input: {
  organizationId: string;
  jobId: string;
  photoId: string;
  paths: string[];
}): Promise<PhotoMutationResult> {
  const supabase = await createClient();
  if (input.paths.length) {
    const { error: storageError } = await supabase.storage
      .from("inspection-photos")
      .remove(input.paths);
    if (storageError) return { ok: false, message: storageError.message };
  }
  const { error } = await supabase
    .from("assets")
    .update({ status: "archived", is_cover: false })
    .eq("id", input.photoId)
    .eq("organization_id", input.organizationId);
  if (error) return { ok: false, message: error.message };
  const { error: statusError } = await resetPhotoStatus(supabase, input.organizationId, input.jobId);
  if (statusError) return { ok: false, message: statusError.message };
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath(`/jobs/${input.jobId}/photos`);
  return { ok: true };
}

export async function moveJobPhoto(input: {
  organizationId: string;
  jobId: string;
  photoId: string;
  movement: "up" | "down";
}): Promise<PhotoMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_job_photo", {
    target_organization_id: input.organizationId,
    target_asset_id: input.photoId,
    movement: input.movement,
  });
  if (error) return { ok: false, message: error.message };
  const { error: statusError } = await resetPhotoStatus(supabase, input.organizationId, input.jobId);
  if (statusError) return { ok: false, message: statusError.message };
  revalidatePath(`/jobs/${input.jobId}/photos`);
  return { ok: true };
}
