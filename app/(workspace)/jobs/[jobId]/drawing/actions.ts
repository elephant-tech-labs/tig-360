"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DiagramMarkerInput = {
  key: string;
  findingId: string | null;
  label: string;
  x: number;
  y: number;
};

type DiagramSaveInput = {
  organizationId: string;
  jobId: string;
  sourceJson: Record<string, unknown>;
  markers: DiagramMarkerInput[];
  canvasWidth: number;
  canvasHeight: number;
  status: "draft" | "complete" | "skipped";
};

export type DiagramMutationResult =
  | { ok: true; draftId?: string; version?: number }
  | { ok: false; message: string };

export async function saveDiagramDraft(
  input: DiagramSaveInput,
): Promise<DiagramMutationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_diagram_draft", {
    target_organization_id: input.organizationId,
    target_job_id: input.jobId,
    diagram_source_json: input.sourceJson,
    marker_items: input.markers,
    diagram_canvas_width: input.canvasWidth,
    diagram_canvas_height: input.canvasHeight,
    diagram_status: input.status,
  });

  if (error) return { ok: false, message: error.message };
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath(`/jobs/${input.jobId}/drawing`);
  return { ok: true, draftId: data ?? undefined };
}

export async function publishDiagramVersion(
  formData: FormData,
): Promise<DiagramMutationResult> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const jobId = String(formData.get("jobId") ?? "");
  const status = String(formData.get("status") ?? "complete") as "complete" | "skipped";
  const sourceJson = JSON.parse(String(formData.get("sourceJson") ?? '{"objects":[]}'));
  const markers = JSON.parse(String(formData.get("markers") ?? "[]")) as DiagramMarkerInput[];
  const canvasWidth = Number(formData.get("canvasWidth") ?? 1200);
  const canvasHeight = Number(formData.get("canvasHeight") ?? 780);
  const render = formData.get("render");

  if (!organizationId || !jobId) {
    return { ok: false, message: "The organization and job are required." };
  }
  if (status !== "complete" && status !== "skipped") {
    return { ok: false, message: "Invalid diagram status." };
  }

  const supabase = await createClient();
  let renderPath: string | null = null;

  if (render instanceof File && render.size > 0) {
    renderPath = `${organizationId}/${jobId}/${Date.now()}-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("diagram-renders")
      .upload(renderPath, render, {
        contentType: "image/png",
        upsert: false,
      });
    if (uploadError) return { ok: false, message: uploadError.message };
  }

  const { data, error } = await supabase.rpc("publish_diagram_version", {
    target_organization_id: organizationId,
    target_job_id: jobId,
    diagram_source_json: sourceJson,
    marker_items: markers,
    diagram_canvas_width: canvasWidth,
    diagram_canvas_height: canvasHeight,
    diagram_render_path: renderPath,
    diagram_status: status,
  });

  if (error) {
    if (renderPath) await supabase.storage.from("diagram-renders").remove([renderPath]);
    return { ok: false, message: error.message };
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/drawing`);
  return { ok: true, version: Number(data?.version ?? 0) };
}
