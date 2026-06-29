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
import { loadReportVersions } from "@/lib/reports/load-report";
import { refreshSignatureRequestStatus, sendContractForSignature, startEmbeddedContractSigning } from "./actions";

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
          id, version, status, approval_status, created_at,
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
  ]);
  if (error || !job) notFound();

  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const approvedVersions = versions.filter(
    (version) => version.approvalStatus === "approved" && version.status === "ready",
  );
  const latestApproved = approvedVersions[0] ?? null;
  const supportingVersions = (supportingDocuments ?? []).flatMap((document) =>
    (document.document_versions ?? [])
      .filter((version) => version.status === "ready")
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
        };
      }),
  );
  const signatureDocuments = supportingVersions
    .filter((version) => version.kind === "contract" || version.kind === "proposal")
    .sort((left, right) => {
      const kindSort = left.kind === right.kind ? 0 : left.kind === "contract" ? -1 : 1;
      return kindSort || right.version - left.version;
    });

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
  const reportAddress = `${property?.street_line_1 ?? "Property"} · Report #${job.job_number}`;
  const defaultSubject = `Inspection Report #${job.job_number} - ${property?.street_line_1 ?? "Property"}`;
  const defaultMessage = `Hello,\n\nPlease find attached the structural pest inspection report for ${reportAddress}.\n\nRegards,\n${organization.name}`;
  const initialDraft: SendCenterDraft = {
    id: sourceDelivery && !isResend && ["draft", "failed"].includes(sourceDelivery.status)
      ? sourceDelivery.id
      : null,
    versionId: sourceDelivery?.document_version_id ?? latestApproved?.id ?? "",
    packageMode: sourceDelivery?.package_mode ?? "report_only",
    supportingVersionId: sourceDelivery?.attachment_version_ids?.[0] ?? supportingVersions[0]?.id ?? "",
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
      <JobAuthoringNav jobId={jobId} current="review" states={workflowStates} />

      <div className="send-center-page">
        {messages.error ? <div className="form-alert error"><AlertTriangle size={17} /> {messages.error}</div> : null}
        {messages.saved ? <div className="form-alert success"><Check size={17} /> {messages.saved}</div> : null}
        {messages.sent ? <div className="form-alert success"><Check size={17} /> {messages.sent}</div> : null}

        <header className="send-center-heading">
          <div>
            <p className="eyebrow">Approved document delivery</p>
            <h1>Send Center</h1>
            <p>Compose, send, retry, and audit every report delivery from one workspace.</p>
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
                  <p className="eyebrow">Zoho Sign</p>
                  <h2>Contract signature</h2>
                </div>
                <FileSignature size={19} />
              </div>
              <p className="panel-helper">
                Send a generated work authorization PDF for customer signature. The contract PDF includes Zoho Sign text tags for signer name, date, and signature.
              </p>
              {signatureDocuments.length ? (
                <form action={sendContractForSignature} className="signature-send-form">
                  <input name="jobId" type="hidden" value={jobId} />
                  <label>
                    Contract PDF
                    <select name="documentVersionId" defaultValue={signatureDocuments[0]?.id}>
                      {signatureDocuments.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.label}{version.approvalStatus === "approved" ? " · approved" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
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
                  <div className="signature-override-grid">
                    <label>
                      Signer name override
                      <input name="signerName" placeholder={signatureCandidates[0]?.name ?? "Customer name"} />
                    </label>
                    <label>
                      Signer email override
                      <input name="signerEmail" placeholder={signatureCandidates[0]?.email ?? "customer@example.com"} type="email" />
                    </label>
                  </div>
                  <div className="signature-send-actions">
                    <button className="primary-button" type="submit">
                      <FileSignature size={16} /> Send for signature
                    </button>
                    <button className="secondary-button" formAction={startEmbeddedContractSigning} type="submit">
                      <ExternalLink size={16} /> Start embedded signing
                    </button>
                    <span>Use embedded signing when the signer is with you now. Zoho opens a short-lived signer session.</span>
                  </div>
                </form>
              ) : (
                <div className="signature-empty">
                  <AlertTriangle size={17} />
                  Generate a contract PDF from the Proposal page before sending for signature.
                </div>
              )}

              <div className="signature-request-list">
                <h3>Signature history</h3>
                {signatureRequests?.length ? signatureRequests.map((request) => {
                  const version = Array.isArray(request.document_versions)
                    ? request.document_versions[0]
                    : request.document_versions;
                  const document = version
                    ? Array.isArray(version.documents) ? version.documents[0] : version.documents
                    : null;
                  return (
                    <article className={`signature-request-item status-${request.status}`} key={request.id}>
                      <div>
                        <div className="delivery-history-topline">
                          <span className={`delivery-status-badge ${request.status}`}>{request.status}</span>
                          <small>{new Date(request.created_at).toLocaleString()}</small>
                        </div>
                        <strong>{request.request_name}</strong>
                        <span>
                          {document?.title ?? "Contract"} v{version?.version ?? "?"} · {request.signer_name} · {request.signer_email}
                        </span>
                        {request.provider_request_id ? (
                          <span>
                            Zoho request {request.provider_request_id}
                            {request.status === "draft" ? " · draft created in Zoho Sign" : ""}
                          </span>
                        ) : null}
                        {request.failure_message ? <p>{request.failure_message}</p> : null}
                      </div>
                      {request.provider_request_id ? (
                        <div className="signature-request-actions">
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
                    </article>
                  );
                }) : (
                  <p className="panel-empty-copy">No signature activity yet.</p>
                )}
              </div>
            </section>

            {latestApproved ? (
              <SendCenterComposer
                directoryRecipients={directoryRecipients}
                downloadHref={`/jobs/${jobId}/review/versions/${latestApproved.id}/download`}
                initialDraft={initialDraft}
                jobId={jobId}
                providerLabel={providerLabel()}
                supportingVersions={supportingVersions}
                versions={approvedVersions.map((version) => ({
                  id: version.id,
                  version: version.version,
                  approvedLabel: version.approvedAt
                    ? new Date(version.approvedAt).toLocaleDateString()
                    : "",
                }))}
              />
            ) : (
              <div className="send-center-empty">
                <FileCheck2 size={32} />
                <h2>No approved report version</h2>
                <p>Generate and approve a PDF in Review before preparing delivery.</p>
                <Link className="primary-button" href={`/jobs/${jobId}/review`}>Open Review</Link>
              </div>
            )}
          </main>

          <aside className="delivery-history-panel">
            <div className="section-heading compact">
              <div><p className="eyebrow">Audit trail</p><h2>Delivery history</h2></div>
              <Mail size={18} />
            </div>
            {deliveries?.length ? (
              <div className="delivery-history-list">
                {deliveries.map((delivery) => {
                  const version = Array.isArray(delivery.document_versions)
                    ? delivery.document_versions[0]
                    : delivery.document_versions;
                  const attempts = [...(delivery.delivery_attempts ?? [])].sort(
                    (left, right) => right.attempt_number - left.attempt_number,
                  );
                  const editable = ["draft", "failed"].includes(delivery.status);
                  return (
                    <article className={`delivery-history-item status-${delivery.status}`} key={delivery.id}>
                      <div className="delivery-history-topline">
                        <span className={`delivery-status-badge ${delivery.status}`}>{delivery.status}</span>
                        <small>{delivery.sent_at ? new Date(delivery.sent_at).toLocaleString() : new Date(delivery.created_at).toLocaleString()}</small>
                      </div>
                      <strong>{delivery.subject}</strong>
                      <span>Report v{version?.version ?? "?"} · {delivery.package_mode?.replaceAll("_", " ") ?? "report only"}</span>
                      <div className="delivery-recipient-chips">
                        {(delivery.delivery_recipients ?? []).map((recipient) => (
                          <span key={recipient.id}>{recipient.recipient_type.toUpperCase()} · {recipient.display_name || recipient.email}</span>
                        ))}
                      </div>
                      {attempts.length ? (
                        <div className="delivery-attempt-summary">
                          <Clock3 size={12} />
                          {attempts.length} attempt{attempts.length === 1 ? "" : "s"} · {attempts[0].provider.replaceAll("_", " ")}
                        </div>
                      ) : null}
                      {delivery.status === "sent" ? (
                        <div className={`crm-sync-state ${delivery.crm_sync_status}`}>
                          CRM · {delivery.crm_sync_status.replaceAll("_", " ")}
                        </div>
                      ) : null}
                      {delivery.failure_message ? <p>{delivery.failure_message}</p> : null}
                      {delivery.crm_failure_message ? <p>{delivery.crm_failure_message}</p> : null}
                      <div className="delivery-history-actions">
                        {editable ? (
                          <Link className="text-button" href={`/jobs/${jobId}/send?draft=${delivery.id}`}>
                            {delivery.status === "failed" ? <RotateCw size={13} /> : null}
                            {delivery.status === "failed" ? "Retry" : "Open draft"}
                          </Link>
                        ) : (
                          <Link className="text-button" href={`/jobs/${jobId}/send?resend=${delivery.id}`}>
                            <RotateCw size={13} /> Send again
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="panel-empty-copy">No delivery activity yet.</p>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
