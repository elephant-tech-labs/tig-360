import type { SupabaseClient } from "@supabase/supabase-js";
import { jobPartyRoleLabel } from "@/lib/job-parties";
import {
  bundledBrandAsset,
  embeddedStorageImage,
} from "@/lib/reports/brand-assets";
import type {
  InspectionReportBundle,
  InspectionReportSnapshot,
  ReadinessIssue,
  ReportMedia,
  ReportVersionSummary,
} from "@/lib/reports/types";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function findingReference(finding: {
  entry_type: string;
  area_code: number | null;
  finding_letter: string | null;
}) {
  return finding.entry_type === "note"
    ? `Note ${finding.finding_letter ?? ""}`.trim()
    : `${finding.area_code ?? ""}${finding.finding_letter ?? ""}`;
}

async function signedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string | null,
) {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function loadInspectionReportBundle(
  supabase: SupabaseClient,
  organization: { id: string; name: string },
  jobId: string,
): Promise<InspectionReportBundle> {
  const [
    { data: job, error: jobError },
    { data: findingSummary },
    { data: findings, error: findingsError },
    { data: photos, error: photosError },
    { data: diagramDraft },
    { data: latestDiagram },
    { data: photoState },
    { data: reportProfile },
  ] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select(`
        id, job_number, report_type, inspection_at, escrow_number, summary,
        inspection_tag_posted, other_tags_posted, garage_description,
        include_inspector_signature, inspected_by_id,
        properties(street_line_1, street_line_2, city, region, postal_code, county, property_type),
        prior_job:inspection_jobs!prior_job_id(job_number),
        job_parties(
          role, is_primary, receive_report_by_default,
          contacts(id, first_name, last_name, email, companies(name))
        ),
        inspectors:inspectors!inspection_jobs_inspected_by_inspector_fkey(
          full_name, email, phone, license_number, signature_path
        )
      `)
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("job_finding_summaries")
      .select("subterranean_termites, drywood_termites, fungus_dryrot, other_findings, further_inspection, status")
      .eq("inspection_job_id", jobId)
      .maybeSingle(),
    supabase
      .from("findings")
      .select(`
        id, entry_type, area_code, finding_letter, title, description,
        classification, note_placement, sort_order,
        recommendations(id, description, estimated_cost, sort_order)
      `)
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("assets")
      .select(`
        id, provider_file_id, annotated_render_path, original_filename, caption,
        location_label, is_cover, sort_order, evidence_links(finding_id)
      `)
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .in("kind", ["property_photo", "inspection_photo"])
      .eq("include_in_report", true)
      .neq("status", "archived")
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("diagram_drafts")
      .select("status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("diagrams")
      .select("id, version, render_path, status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("job_photo_states")
      .select("status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("organization_report_profiles")
      .select("*")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  if (jobError || !job) throw new Error(jobError?.message ?? "Inspection job not found.");
  if (findingsError) throw new Error(findingsError.message);
  if (photosError) throw new Error(photosError.message);

  const property = one(job.properties);
  const inspector = one(job.inspectors);
  const priorJob = one(job.prior_job);
  if (!property) throw new Error("The inspection property was not found.");

  const { data: applicableLegalBlocks, error: legalError } = await supabase
    .from("report_content_blocks")
    .select("id, title, body, placement, sort_order, version, is_required")
    .eq("organization_id", organization.id)
    .eq("is_active", true)
    .contains("report_types", [job.report_type])
    .or(`effective_from.is.null,effective_from.lte.${new Date().toISOString().slice(0, 10)}`)
    .order("placement")
    .order("sort_order");
  if (legalError) throw new Error(legalError.message);

  const snapshot: InspectionReportSnapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    organization: {
      id: organization.id,
      name: organization.name,
      legalName: reportProfile?.legal_name || organization.name,
      streetLine1: reportProfile?.street_line_1 ?? null,
      streetLine2: reportProfile?.street_line_2 ?? null,
      city: reportProfile?.city ?? null,
      region: reportProfile?.region ?? null,
      postalCode: reportProfile?.postal_code ?? null,
      phone: reportProfile?.phone ?? null,
      email: reportProfile?.email ?? null,
      website: reportProfile?.website ?? null,
      registrationNumber: reportProfile?.registration_number ?? null,
      operatorLicense: reportProfile?.operator_license ?? null,
      contractorLicense: reportProfile?.contractor_license ?? null,
      regulatoryContact: reportProfile?.regulatory_contact ?? null,
      logoPath: reportProfile?.logo_path ?? null,
    },
    job: {
      id: job.id,
      number: Number(job.job_number),
      reportType: job.report_type,
      inspectionAt: job.inspection_at,
      escrowNumber: job.escrow_number,
      generalDescription: job.summary,
      priorJobNumber: priorJob?.job_number ? Number(priorJob.job_number) : null,
      inspectionTagPosted: job.inspection_tag_posted,
      otherTagsPosted: job.other_tags_posted,
      garageDescription: job.garage_description,
    },
    property: {
      streetLine1: property.street_line_1,
      streetLine2: property.street_line_2,
      city: property.city,
      region: property.region,
      postalCode: property.postal_code,
      county: property.county,
      propertyType: property.property_type,
    },
    inspector: inspector
      ? {
          name: inspector.full_name || inspector.email || "Inspector",
          email: inspector.email,
          phone: inspector.phone,
          licenseNumber: inspector.license_number,
          includeSignature: job.include_inspector_signature,
          signaturePath: inspector.signature_path,
          signatureBucket: "inspector-signatures",
        }
      : null,
    findingSummary: {
      subterraneanTermites: findingSummary?.subterranean_termites ?? false,
      drywoodTermites: findingSummary?.drywood_termites ?? false,
      fungusDryrot: findingSummary?.fungus_dryrot ?? false,
      otherFindings: findingSummary?.other_findings ?? false,
      furtherInspection: findingSummary?.further_inspection ?? false,
    },
    parties: (job.job_parties ?? []).flatMap((party) => {
      const contact = one(party.contacts);
      if (!contact) return [];
      const company = one(contact.companies);
      return [{
        contactId: contact.id,
        name: `${contact.first_name} ${contact.last_name}`.trim(),
        company: company?.name ?? null,
        email: contact.email,
        role: party.role,
        roleLabel: jobPartyRoleLabel(party.role),
        isPrimary: party.is_primary,
        sendByDefault: party.receive_report_by_default,
      }];
    }),
    findings: (findings ?? []).map((finding) => ({
      id: finding.id,
      entryType: finding.entry_type as "finding" | "note",
      reference: findingReference(finding),
      title: finding.title,
      description: finding.description ?? "",
      classification: finding.classification,
      notePlacement: finding.note_placement as "before" | "after" | null,
      recommendations: [...(finding.recommendations ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((recommendation) => ({
          id: recommendation.id,
          description: recommendation.description,
          estimatedCost: recommendation.estimated_cost,
        })),
    })),
    photos: (photos ?? []).map((photo) => ({
      id: photo.id,
      path: photo.annotated_render_path || photo.provider_file_id,
      bucket: "inspection-photos",
      filename: photo.original_filename,
      caption: photo.caption ?? "",
      location: photo.location_label ?? "",
      isCover: photo.is_cover,
      findingIds: (photo.evidence_links ?? [])
        .map((link) => link.finding_id)
        .filter(Boolean) as string[],
    })),
    diagram: latestDiagram?.status === "complete"
      ? {
          id: latestDiagram.id,
          version: latestDiagram.version,
          path: latestDiagram.render_path,
          bucket: "diagram-renders",
        }
      : null,
    legalContent: (applicableLegalBlocks ?? []).map((block) => ({
      id: block.id,
      title: block.title,
      body: block.body,
      placement: block.placement as "before_findings" | "after_findings" | "contract",
      sortOrder: block.sort_order,
      version: block.version,
      required: block.is_required,
    })),
  };

  const issues: ReadinessIssue[] = [];
  const requiresPrior = ["supplemental", "reinspection"].includes(job.report_type);
  if (!property.street_line_1 || !property.city || !property.region || !property.postal_code) {
    issues.push({ key: "property", label: "Complete property address", detail: "The report cover requires a complete property address.", severity: "blocking", href: `/jobs/${jobId}/edit` });
  }
  if (!job.inspection_at) {
    issues.push({ key: "inspection", label: "Schedule the inspection", detail: "An inspection date is required on the report.", severity: "blocking", href: `/jobs/${jobId}/edit` });
  }
  if (!inspector) {
    issues.push({ key: "inspector", label: "Select an inspector", detail: "The report must identify the inspector of record.", severity: "blocking", href: `/jobs/${jobId}/edit` });
  }
  if (job.include_inspector_signature && !inspector?.signature_path) {
    issues.push({ key: "signature", label: "Add inspector signature", detail: "Signature inclusion is enabled, but the inspector has no saved signature.", severity: "blocking", href: "/team/inspectors" });
  }
  if (requiresPrior && !priorJob) {
    issues.push({ key: "prior", label: "Link prior inspection", detail: "Supplemental and reinspection reports require the prior job.", severity: "blocking", href: `/jobs/${jobId}/edit` });
  }
  if (!["complete", "skipped"].includes(diagramDraft?.status ?? "")) {
    issues.push({ key: "drawing-state", label: "Finish or skip the drawing", detail: "Set the drawing workflow state before generating the report.", severity: "blocking", href: `/jobs/${jobId}/drawing` });
  } else if (diagramDraft?.status === "complete" && !snapshot.diagram?.path) {
    issues.push({ key: "drawing-version", label: "Save a drawing version", detail: "The report needs a frozen drawing PNG, not only the editable draft.", severity: "blocking", href: `/jobs/${jobId}/drawing` });
  }
  if (findingSummary?.status !== "complete") {
    issues.push({ key: "findings-state", label: "Complete findings review", detail: "Mark findings complete, or confirm that the inspection has no findings.", severity: "blocking", href: `/jobs/${jobId}/findings` });
  }
  if (!snapshot.photos.length) {
    issues.push({ key: "photos-empty", label: "No inspection photos attached", detail: "Photos are optional. The report can be generated without a cover image or photo section.", severity: "advisory", href: `/jobs/${jobId}/photos` });
  } else if (!["complete", "not_required"].includes(photoState?.status ?? "")) {
    issues.push({ key: "photos-state", label: "Photo selection is still in progress", detail: "Photos are optional. The report will use the current included-photo selections.", severity: "advisory", href: `/jobs/${jobId}/photos` });
  }
  if (!snapshot.findings.length) {
    issues.push({ key: "findings", label: "No report entries", detail: "The report currently has no findings or explanatory notes.", severity: "advisory", href: `/jobs/${jobId}/findings` });
  }
  if (snapshot.photos.length && !snapshot.photos.some((photo) => photo.isCover)) {
    issues.push({ key: "cover", label: "No cover photo selected", detail: "The report can be generated, but the cover will not include a property photo.", severity: "advisory", href: `/jobs/${jobId}/photos` });
  }
  if (!snapshot.parties.some((party) => party.email && (party.role === "report_recipient" || party.sendByDefault))) {
    issues.push({ key: "recipient", label: "No default report recipient", detail: "Add or preselect a recipient before using Send Center.", severity: "advisory", href: `/jobs/${jobId}/contacts` });
  }

  const coverPhoto = snapshot.photos.find((photo) => photo.isCover) ?? null;
  const photoUrlEntries = await Promise.all(
    snapshot.photos.map(async (photo) => [
      photo.id,
      await signedUrl(supabase, photo.bucket, photo.path),
    ] as const),
  );
  const [uploadedCompanyLogo, defaultCompanyLogo, defaultCompanyLogoDark] = await Promise.all([
    embeddedStorageImage(
      supabase,
      "organization-branding",
      snapshot.organization.logoPath,
    ),
    bundledBrandAsset("trident-logo-light.png"),
    bundledBrandAsset("trident-logo-dark.png"),
  ]);
  const media: ReportMedia = {
    coverUrl: coverPhoto ? await signedUrl(supabase, coverPhoto.bucket, coverPhoto.path) : null,
    diagramUrl: snapshot.diagram?.path
      ? await signedUrl(supabase, snapshot.diagram.bucket, snapshot.diagram.path)
      : null,
    signatureUrl: snapshot.inspector?.includeSignature
      ? await signedUrl(supabase, snapshot.inspector.signatureBucket, snapshot.inspector.signaturePath)
      : null,
    companyLogoUrl: uploadedCompanyLogo ?? defaultCompanyLogo,
    companyLogoDarkUrl: defaultCompanyLogoDark,
    photoUrls: Object.fromEntries(photoUrlEntries.filter((entry): entry is [string, string] => Boolean(entry[1]))),
  };

  return {
    snapshot,
    media,
    readiness: {
      canGenerate: !issues.some((issue) => issue.severity === "blocking"),
      issues,
    },
  };
}

export async function loadReportVersions(
  supabase: SupabaseClient,
  organizationId: string,
  jobId: string,
): Promise<ReportVersionSummary[]> {
  const { data, error } = await supabase
    .from("documents")
    .select(`
      document_versions(
        id, version, status, approval_status, approved_at, generated_at,
        created_at, failure_message,
        assets(provider_file_id, original_filename)
      )
    `)
    .eq("organization_id", organizationId)
    .eq("inspection_job_id", jobId)
    .eq("kind", "inspection_report")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return [...(data?.document_versions ?? [])]
    .sort((a, b) => b.version - a.version)
    .map((version) => {
      const asset = one(version.assets);
      return {
        id: version.id,
        version: version.version,
        status: version.status,
        approvalStatus: version.approval_status,
        approvedAt: version.approved_at,
        generatedAt: version.generated_at,
        createdAt: version.created_at,
        failureMessage: version.failure_message,
        assetPath: asset?.provider_file_id ?? null,
        filename: asset?.original_filename ?? null,
      };
    });
}
