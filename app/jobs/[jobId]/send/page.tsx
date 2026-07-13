import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileSignature,
  Mail,
  RotateCw,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { JobAuthoringNav } from "@/components/job-authoring-nav";
import { JobWorkspaceHeader } from "@/components/job-workspace-header";
import {
  SendCenterComposer,
  type SendCenterDraft,
  type SendCenterRecipient,
} from "@/components/send-center-composer";
import { canCreateJobs } from "@/lib/access";
import { getCurrentContext } from "@/lib/current-organization";
import { jobPartyRoleLabel } from "@/lib/job-parties";
import { getJobWorkflowStates } from "@/lib/job-workflow";
import { loadProposalSnapshot } from "@/lib/proposals/load-proposal-snapshot";
import { loadReportVersions } from "@/lib/reports/load-report";
import {
  refreshSignatureRequestStatus,
  sendContractForSignature,
  sendCustomerReviewPackage,
  startEmbeddedContractSigning,
} from "./actions";

type SendPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{
    saved?: string;
    sent?: string;
    error?: string;
    draft?: string;
    resend?: string;
  }>;
};

type DeliveryRecipient = {
  contact_id: string | null;
  email: string;
  display_name: string | null;
  recipient_type: "to" | "cc" | "bcc";
};

type SignatureCandidate = {
  contactId: string | null;
  name: string;
  email: string;
  roleLabel: string;
  score: number;
};

function providerLabel() {
  const selected = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (selected === "zoho_mail") {
    return process.env.ZOHO_MAIL_ACCOUNT_ID && process.env.ZOHO_REFRESH_TOKEN && process.env.REPORT_EMAIL_FROM
      ? "Zoho Mail"
      : null;
  }
  if (selected === "resend") {
    return process.env.RESEND_API_KEY && process.env.REPORT_EMAIL_FROM ? "Resend" : null;
  }
  if (process.env.ZOHO_MAIL_ACCOUNT_ID && process.env.ZOHO_REFRESH_TOKEN && process.env.REPORT_EMAIL_FROM) {
    return "Zoho Mail";
  }
  if (process.env.RESEND_API_KEY && process.env.REPORT_EMAIL_FROM) return "Resend";
  return null;
}

function zohoSignWebUrl() {
  return process.env.ZOHO_SIGN_WEB_BASE || "https://sign.zoho.eu";
}

function proposalSnapshotHash(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const hash = (value as { contentHash?: unknown }).contentHash;
  return typeof hash === "string" && hash ? hash : null;
}

export default async function SendCenterPage({ params, searchParams }: SendPageProps) {
  const { jobId } = await params;
  const messages = await searchParams;
  const { supabase, organization, userName, membership } = await getCurrentContext();
  if (!canCreateJobs(membership.role)) redirect(`/jobs/${jobId}`);

  const [
    { data: job, error },
    versions,
    workflowStates,
    { data: deliveries },
    { data: supportingDocuments },
    { data: signatureRequests },
    { data: reviewLinks },
    { data: proposal },
  ] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select(`
        id, job_number, report_type,
        properties(street_line_1, city, region, postal_code),
        job_parties(
          id, role, is_primary, receive_report_by_default,
          contacts(id, first_name, last_name, email, secondary_email)
        )
      `)
      .eq("id", jobId)
      .eq("organization_id", organization.id)
      .single(),
    loadReportVersions(supabase, organization.id, jobId),
    getJobWorkflowStates(supabase, organization.id, jobId),
    supabase
      .from("deliveries")
      .select(`
        id, document_version_id, status, subject, message_body, reply_to,
        package_mode, attachment_version_ids, provider, provider_message_id,
        attempt_count, created_at, sent_at, failure_message,
        crm_sync_status, crm_failure_message,
        document_versions(version),
        delivery_recipients(id, contact_id, email, display_name, recipient_type, delivery_status),
        delivery_attempts(id, attempt_number, provider, status, started_at, completed_at, failure_message)
      `)
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("documents")
      .select(`
        id, kind, title,
        document_versions(
          id, version, status, approval_status, created_at, generated_at, snapshot,
          assets(provider_file_id, original_filename)
        )
      `)
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .in("kind", ["contract", "proposal"]),
    supabase
      .from("signature_requests")
      .select(`
        id, document_version_id, contact_id, signer_name, signer_email,
        status, provider_request_id, provider_status, request_name, failure_message,
        sent_at, completed_at, last_status_checked_at, created_at,
        document_versions(version, documents(kind, title))
      `)
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("proposal_review_links")
      .select("id, signer_name, signer_email, status, expires_at, last_viewed_at, created_at")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_proposals")
      .select("id, status")
      .eq("inspection_job_id", jobId)
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);
  if (error || !job) notFound();

  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const approvedVersions = versions.filter(
    (version) => version.approvalStatus === "approved" && version.status === "ready",
  );
  const latestApproved = approvedVersions[0] ?? null;
  let currentProposalSnapshotHash: string | null = null;
  if (proposal?.id && proposal.status === "approved") {
    try {
      currentProposalSnapshotHash = (await loadProposalSnapshot(
        supabase,
        organization,
        jobId,
        proposal.id,
      )).contentHash ?? null;
    } catch {
      currentProposalSnapshotHash = null;
    }
  }
  const supportingVersions = (supportingDocuments ?? []).flatMap((document) =>
    (document.document_versions ?? [])
      .filter((version) => version.status === "ready" && version.approval_status === "approved")
      .map((version) => {
        const asset = Array.isArray(version.assets) ? version.assets[0] : version.assets;
        return {
          id: version.id,
          label: `${document.title} · v${version.version}`,
          filename: asset?.original_filename ?? `${document.kind}.pdf`,
          kind: document.kind,
          version: version.version,
          approvalStatus: version.approval_status,
          createdAt: version.created_at,
          snapshotHash: proposalSnapshotHash(version.snapshot),
        };
      }),
  );
  const signatureDocuments = supportingVersions
    .filter((version) => version.kind === "contract" || version.kind === "proposal")
    .sort((left, right) => {
      const kindSort = left.kind === right.kind ? 0 : left.kind === "contract" ? -1 : 1;
      return kindSort || right.version - left.version;
    });
  const currentSignatureDocument = currentProposalSnapshotHash
    ? signatureDocuments.find((version) => version.snapshotHash === currentProposalSnapshotHash) ?? null
    : signatureDocuments[0] ?? null;

  const sourceDeliveryId = messages.draft || messages.resend || null;
  const sourceDelivery = sourceDeliveryId
    ? (deliveries ?? []).find((delivery) => delivery.id === sourceDeliveryId) ?? null
    : null;
  const sourceRecipients = (sourceDelivery?.delivery_recipients ?? []) as DeliveryRecipient[];
  const isResend = Boolean(messages.resend);
  const recipientByEmail = new Map<string, SendCenterRecipient>();

  for (const party of job.job_parties ?? []) {
    const contact = Array.isArray(party.contacts) ? party.contacts[0] : party.contacts;
    if (!contact) continue;
    const name = `${contact.first_name} ${contact.last_name}`.trim();
    const emails = [
      { email: contact.email, label: "Primary email" },
      { email: contact.secondary_email, label: "Secondary email" },
    ].filter((entry): entry is { email: string; label: string } => Boolean(entry.email));

    for (const entry of emails) {
      const key = entry.email.trim().toLowerCase();
      const existing = recipientByEmail.get(key);
      const saved = sourceRecipients.find((recipient) => recipient.email.toLowerCase() === key);
      if (existing) {
        if (!existing.roles.includes(jobPartyRoleLabel(party.role))) {
          existing.roles.push(jobPartyRoleLabel(party.role));
        }
        existing.selected = existing.selected || party.receive_report_by_default || Boolean(saved);
        continue;
      }
      recipientByEmail.set(key, {
        key,
        contactId: contact.id,
        name,
        email: entry.email,
        roles: [jobPartyRoleLabel(party.role)],
        selected: sourceDelivery
          ? Boolean(saved)
          : party.receive_report_by_default || party.role === "report_recipient",
        type: saved?.recipient_type ?? "to",
        channelLabel: entry.label,
      });
    }
  }
  const directoryRecipients = Array.from(recipientByEmail.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const signatureCandidateByEmail = new Map<string, SignatureCandidate>();
  const signatureRoleScore: Record<string, number> = {
    signer: 0,
    report_recipient: 1,
    ordered_by: 2,
    property_owner: 3,
    party_of_interest: 4,
  };
  for (const party of job.job_parties ?? []) {
    const contact = Array.isArray(party.contacts) ? party.contacts[0] : party.contacts;
    if (!contact?.email) continue;
    const email = contact.email.trim().toLowerCase();
    const score = signatureRoleScore[party.role] ?? 10;
    const existing = signatureCandidateByEmail.get(email);
    if (existing && existing.score <= score) continue;
    signatureCandidateByEmail.set(email, {
      contactId: contact.id,
      name: `${contact.first_name} ${contact.last_name}`.trim() || email,
      email,
      roleLabel: jobPartyRoleLabel(party.role),
      score,
    });
  }
  const signatureCandidates = Array.from(signatureCandidateByEmail.values())
    .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name));
  const hasSuggestedSigner = signatureCandidates.length > 0;
  const reportAddress = `${property?.street_line_1 ?? "Property"} · Report #${job.job_number}`;
  const defaultSubject = `Inspection Report #${job.job_number} - ${property?.street_line_1 ?? "Property"}`;
  const defaultMessage = `Hello,\n\nPlease find attached the structural pest inspection report for ${reportAddress}.\n\nRegards,\n${organization.name}`;
  const initialDraft: SendCenterDraft = {
    id: sourceDelivery && !isResend && ["draft", "failed"].includes(sourceDelivery.status)
      ? sourceDelivery.id
      : null,
    versionId: sourceDelivery?.document_version_id ?? latestApproved?.id ?? "",
    packageMode: sourceDelivery?.package_mode ?? "report_only",
    supportingVersionId: sourceDelivery?.attachment_version_ids?.[0] ?? currentSignatureDocument?.id ?? "",
    subject: sourceDelivery?.subject ?? defaultSubject,
    message: sourceDelivery?.message_body ?? defaultMessage,
    replyTo: sourceDelivery?.reply_to ?? process.env.REPORT_EMAIL_FROM ?? "",
    recipients: sourceRecipients.map((recipient) => ({
      contactId: recipient.contact_id,
      email: recipient.email,
      name: recipient.display_name ?? "",
      type: recipient.recipient_type,
    })),
  };
  const activityItems = [
    ...(deliveries ?? []).map((item) => ({
      kind: "delivery" as const,
      occurredAt: item.sent_at ?? item.created_at,
      item,
    })),
    ...(reviewLinks ?? []).map((item) => ({
      kind: "review" as const,
      occurredAt: item.created_at,
      item,
    })),
    ...(signatureRequests ?? []).map((item) => ({
      kind: "signature" as const,
      occurredAt: item.completed_at ?? item.sent_at ?? item.created_at,
      item,
    })),
  ].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());

  return (
    <AppShell organizationName={organization.name} userName={userName} membershipRole={membership.role}>
      <JobWorkspaceHeader
        address={property?.street_line_1 ?? ""}
        jobId={jobId}
        jobNumber={job.job_number}
        locality={[
          property?.city,
          [property?.region, property?.postal_code].filter(Boolean).join(" "),
        ].filter(Boolean).join(", ")}
        reportType={job.report_type}
      />
      <JobAuthoringNav jobId={jobId} current="send" states={workflowStates} />

      <div className="send-center-page">
        {messages.error ? <div className="form-alert error"><AlertTriangle size={17} /> {messages.error}</div> : null}
        {messages.saved ? <div className="form-alert success"><Check size={17} /> {messages.saved}</div> : null}
        {messages.sent ? <div className="form-alert success"><Check size={17} /> {messages.sent}</div> : null}

        <header className="send-center-heading">
          <div>
            <p className="eyebrow">Approved document delivery</p>
            <h1>Delivery and Signature Center</h1>
            <p>Send the approved report, share the customer review page, and route the work authorization for signature.</p>
          </div>
          <Link className="secondary-button" href={`/jobs/${jobId}/review`}>
            <FileCheck2 size={17} /> Back to Review
          </Link>
        </header>

        <div className="send-center-layout">
          <main className="send-compose-panel">
            <section className="signature-send-panel">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Recommended delivery</p>
                  <h2>Send customer review package</h2>
                </div>
                <Mail size={19} />
              </div>
              <p className="panel-helper">
                The customer receives the approved inspection report, current work authorization, and a secure page to review everything before signing.
              </p>

              <div className="send-preflight">
                <div className={latestApproved ? "ready" : "attention"}>
                  {latestApproved ? <Check size={14} /> : <AlertTriangle size={14} />}
                  <span>{latestApproved ? `Approved report v${latestApproved.version}` : "Approve the report in Review"}</span>
                </div>
                <div className={currentSignatureDocument ? "ready" : "attention"}>
                  {currentSignatureDocument ? <Check size={14} /> : <AlertTriangle size={14} />}
                  <span>
                    {currentSignatureDocument
                      ? `Current work authorization v${currentSignatureDocument.version}`
                      : "Approve and generate a current work authorization"}
                  </span>
                </div>
                <div className={hasSuggestedSigner ? "ready" : "attention"}>
                  {hasSuggestedSigner ? <Check size={14} /> : <AlertTriangle size={14} />}
                  <span>{hasSuggestedSigner ? "Customer selected from job contacts" : "Enter a customer before sending"}</span>
                </div>
              </div>

              {latestApproved && currentSignatureDocument ? (
                <form action={sendCustomerReviewPackage} className="signature-send-form customer-review-package-form">
                  <input name="jobId" type="hidden" value={jobId} />
                  <input name="reportVersionId" type="hidden" value={latestApproved.id} />
                  <input name="proposalVersionId" type="hidden" value={currentSignatureDocument.id} />

                  <div className="customer-review-callout">
                    <strong>One clear customer email</strong>
                    <span>Includes both PDFs and a private review link. Electronic signing starts only when the customer chooses to continue.</span>
                  </div>

                  <div className="send-package-summary">
                    <div>
                      <span>Inspection report</span>
                      <strong>Version {latestApproved.version} · approved</strong>
                    </div>
                    <div>
                      <span>Work authorization</span>
                      <strong>Version {currentSignatureDocument.version} · current</strong>
                    </div>
                  </div>

                  <label>
                    Customer
                    <select name="signer" defaultValue={signatureCandidates[0] ? JSON.stringify(signatureCandidates[0]) : ""}>
                      {signatureCandidates.length ? signatureCandidates.map((candidate) => (
                        <option key={candidate.email} value={JSON.stringify(candidate)}>
                          {candidate.name} · {candidate.email} · {candidate.roleLabel}
                        </option>
                      )) : <option value="">Use a different recipient below</option>}
                    </select>
                  </label>

                  <details className="send-disclosure">
                    <summary>Use a different recipient</summary>
                    <div className="signature-override-grid">
                      <label>
                        Customer name
                        <input name="signerName" placeholder={signatureCandidates[0]?.name ?? "Customer name"} />
                      </label>
                      <label>
                        Customer email
                        <input name="signerEmail" placeholder={signatureCandidates[0]?.email ?? "customer@example.com"} type="email" />
                      </label>
                    </div>
                  </details>

                  <div className="signature-send-actions">
                    <button className="primary-button" type="submit">
                      <Mail size={16} /> Send review package
                    </button>
                    <span>Recommended for remote customers.</span>
                  </div>
                </form>
              ) : (
                <div className="signature-empty send-blocker">
                  <AlertTriangle size={17} />
                  <div>
                    <strong>Package is not ready</strong>
                    <span>Finish the missing approved document before sending.</span>
                  </div>
                  <Link className="secondary-button" href={latestApproved ? `/jobs/${jobId}/proposal` : `/jobs/${jobId}/review`}>
                    {latestApproved ? "Open Proposal" : "Open Review"}
                  </Link>
                </div>
              )}
            </section>

            <details className="send-other-options">
              <summary>
                <span>
                  <strong>Other delivery options</strong>
                  <small>Direct Zoho Sign, in-person signing, or a custom report email</small>
                </span>
              </summary>

              <div className="send-other-options-body">
                {currentSignatureDocument ? (
                  <section className="send-secondary-path">
                    <div>
                      <h3>Direct signature</h3>
                      <p>Use this when the customer does not need the review email, or is signing with you in person.</p>
                    </div>
                    <form action={sendContractForSignature} className="signature-send-form direct-sign-form">
                      <input name="jobId" type="hidden" value={jobId} />
                      <input name="documentVersionId" type="hidden" value={currentSignatureDocument.id} />
                      <label>
                        Signer
                        <select name="signer" defaultValue={signatureCandidates[0] ? JSON.stringify(signatureCandidates[0]) : ""}>
                          {signatureCandidates.length ? signatureCandidates.map((candidate) => (
                            <option key={candidate.email} value={JSON.stringify(candidate)}>
                              {candidate.name} · {candidate.email} · {candidate.roleLabel}
                            </option>
                          )) : <option value="">Enter signer below</option>}
                        </select>
                      </label>
                      <details className="send-disclosure">
                        <summary>Use a different signer</summary>
                        <div className="signature-override-grid">
                          <label>
                            Signer name
                            <input name="signerName" placeholder={signatureCandidates[0]?.name ?? "Signer name"} />
                          </label>
                          <label>
                            Signer email
                            <input name="signerEmail" placeholder={signatureCandidates[0]?.email ?? "signer@example.com"} type="email" />
                          </label>
                        </div>
                      </details>
                      <div className="signature-send-actions secondary-path-actions">
                        <button className="secondary-button" type="submit">
                          <FileSignature size={16} /> Send Zoho Sign only
                        </button>
                        <button className="secondary-button" formAction={startEmbeddedContractSigning} type="submit">
                          <ExternalLink size={16} /> Start in-person signing
                        </button>
                      </div>
                    </form>
                  </section>
                ) : null}

                <details className="send-custom-email">
                  <summary>
                    <strong>Custom email or document package</strong>
                    <span>Send only the report, change recipients, or choose a different attachment arrangement.</span>
                  </summary>
                  <div className="send-custom-email-body">
                    {latestApproved ? (
                      <SendCenterComposer
                        directoryRecipients={directoryRecipients}
                        downloadHref={`/jobs/${jobId}/review/versions/${latestApproved.id}/download`}
                        initialDraft={initialDraft}
                        jobId={jobId}
                        providerLabel={providerLabel()}
                        supportingVersions={currentSignatureDocument ? [currentSignatureDocument] : []}
                        versions={[{
                          id: latestApproved.id,
                          version: latestApproved.version,
                          approvedLabel: latestApproved.approvedAt
                            ? new Date(latestApproved.approvedAt).toLocaleDateString()
                            : "",
                        }]}
                      />
                    ) : (
                      <p className="panel-empty-copy">Approve a report before preparing a custom delivery.</p>
                    )}
                  </div>
                </details>
              </div>
            </details>
          </main>

          <aside className="delivery-history-panel customer-activity-panel">
            <div className="section-heading compact">
              <div><p className="eyebrow">Customer activity</p><h2>Delivery timeline</h2></div>
              <Clock3 size={18} />
            </div>
            {activityItems.length ? (
              <div className="customer-activity-list">
                {activityItems.map((activity) => {
                  if (activity.kind === "review") {
                    const link = activity.item;
                    const reviewState = link.last_viewed_at ? "viewed" : link.status;
                    return (
                      <article className="customer-activity-item" key={`review-${link.id}`}>
                        <div className="customer-activity-marker" />
                        <div>
                          <div className="delivery-history-topline">
                            <span className={`delivery-status-badge ${reviewState}`}>{reviewState}</span>
                            <small>{new Date(activity.occurredAt).toLocaleString()}</small>
                          </div>
                          <strong>Review package for {link.signer_name}</strong>
                          <span>{link.signer_email}</span>
                          <span>
                            {link.last_viewed_at
                              ? `Viewed ${new Date(link.last_viewed_at).toLocaleString()}`
                              : `Expires ${new Date(link.expires_at).toLocaleDateString()}`}
                          </span>
                        </div>
                      </article>
                    );
                  }

                  if (activity.kind === "signature") {
                    const request = activity.item;
                    const version = Array.isArray(request.document_versions)
                      ? request.document_versions[0]
                      : request.document_versions;
                    const document = version
                      ? Array.isArray(version.documents) ? version.documents[0] : version.documents
                      : null;
                    return (
                      <article className="customer-activity-item" key={`signature-${request.id}`}>
                        <div className="customer-activity-marker" />
                        <div>
                          <div className="delivery-history-topline">
                            <span className={`delivery-status-badge ${request.status}`}>{request.status}</span>
                            <small>{new Date(activity.occurredAt).toLocaleString()}</small>
                          </div>
                          <strong>Signature request for {request.signer_name}</strong>
                          <span>{document?.title ?? "Work authorization"} v{version?.version ?? "?"}</span>
                          {request.failure_message ? <p>{request.failure_message}</p> : null}
                          {request.provider_request_id ? (
                            <div className="customer-activity-actions">
                              <a className="text-button" href={zohoSignWebUrl()} rel="noreferrer" target="_blank">
                                <ExternalLink size={13} /> Open Zoho Sign
                              </a>
                              <form action={refreshSignatureRequestStatus}>
                                <input name="jobId" type="hidden" value={jobId} />
                                <input name="signatureRequestId" type="hidden" value={request.id} />
                                <button className="text-button" type="submit">
                                  <RotateCw size={13} /> Refresh
                                </button>
                              </form>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  }

                  const delivery = activity.item;
                  const version = Array.isArray(delivery.document_versions)
                    ? delivery.document_versions[0]
                    : delivery.document_versions;
                  const attempts = [...(delivery.delivery_attempts ?? [])].sort(
                    (left, right) => right.attempt_number - left.attempt_number,
                  );
                  const editable = ["draft", "failed"].includes(delivery.status);
                  return (
                    <article className="customer-activity-item" key={`delivery-${delivery.id}`}>
                      <div className="customer-activity-marker" />
                      <div>
                        <div className="delivery-history-topline">
                          <span className={`delivery-status-badge ${delivery.status}`}>{delivery.status}</span>
                          <small>{new Date(activity.occurredAt).toLocaleString()}</small>
                        </div>
                        <strong>{delivery.subject}</strong>
                        <span>
                          {(delivery.delivery_recipients ?? []).map((recipient) =>
                            recipient.display_name || recipient.email
                          ).join(", ")}
                        </span>
                        {delivery.failure_message ? <p>{delivery.failure_message}</p> : null}
                        <details className="activity-details">
                          <summary>Details</summary>
                          <span>Report v{version?.version ?? "?"} · {delivery.package_mode?.replaceAll("_", " ") ?? "report only"}</span>
                          {attempts.length ? (
                            <span>{attempts.length} attempt{attempts.length === 1 ? "" : "s"} · {attempts[0].provider.replaceAll("_", " ")}</span>
                          ) : null}
                          {delivery.status === "sent" ? (
                            <span>CRM · {delivery.crm_sync_status.replaceAll("_", " ")}</span>
                          ) : null}
                          {delivery.crm_failure_message ? <p>{delivery.crm_failure_message}</p> : null}
                        </details>
                        <div className="customer-activity-actions">
                          <Link className="text-button" href={editable
                            ? `/jobs/${jobId}/send?draft=${delivery.id}`
                            : `/jobs/${jobId}/send?resend=${delivery.id}`}>
                            <RotateCw size={13} />
                            {editable ? (delivery.status === "failed" ? "Retry" : "Open draft") : "Send again"}
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="panel-empty-copy">No customer activity yet.</p>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
