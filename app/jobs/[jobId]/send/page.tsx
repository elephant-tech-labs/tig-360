import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock3,
  Download,
  FileCheck2,
  Mail,
  Send,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { JobAuthoringNav } from "@/components/job-authoring-nav";
import { JobWorkspaceHeader } from "@/components/job-workspace-header";
import { getCurrentContext } from "@/lib/current-organization";
import { getJobWorkflowStates } from "@/lib/job-workflow";
import { loadReportVersions } from "@/lib/reports/load-report";
import { prepareReportDelivery } from "@/app/jobs/[jobId]/send/actions";

type SendPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ saved?: string; sent?: string; error?: string }>;
};

export default async function SendCenterPage({ params, searchParams }: SendPageProps) {
  const { jobId } = await params;
  const messages = await searchParams;
  const { supabase, organization, userName } = await getCurrentContext();
  const [{ data: job, error }, versions, workflowStates, { data: deliveries }, { data: supportingDocuments }] = await Promise.all([
    supabase
      .from("inspection_jobs")
      .select(`
        id, job_number, report_type,
        properties(street_line_1, city, region, postal_code),
        job_parties(
          id, role, is_primary, receive_report_by_default,
          contacts(id, first_name, last_name, email)
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
        id, status, subject, package_mode, created_at, sent_at, failure_message,
        document_versions(version),
        delivery_recipients(id, email, display_name, recipient_type)
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
  ]);
  if (error || !job) notFound();

  const property = Array.isArray(job.properties) ? job.properties[0] : job.properties;
  const approvedVersions = versions.filter((version) => version.approvalStatus === "approved" && version.status === "ready");
  const latestApproved = approvedVersions[0] ?? null;
  const recipientOptions = (job.job_parties ?? []).flatMap((party) => {
    const contact = Array.isArray(party.contacts) ? party.contacts[0] : party.contacts;
    if (!contact?.email) return [];
    return [{
      key: `${contact.id}-${party.role}`,
      contactId: contact.id,
      name: `${contact.first_name} ${contact.last_name}`.trim(),
      email: contact.email,
      role: party.role.replaceAll("_", " "),
      selected: party.receive_report_by_default || party.role === "report_recipient",
    }];
  });
  const uniqueRecipients = Array.from(new Map(recipientOptions.map((recipient) => [recipient.email.toLowerCase(), recipient])).values());
  const reportAddress = `${property?.street_line_1 ?? "Property"} · Report #${job.job_number}`;
  const supportingVersions = (supportingDocuments ?? []).flatMap((document) =>
    (document.document_versions ?? [])
      .filter((version) => version.status === "ready")
      .map((version) => {
        const asset = Array.isArray(version.assets) ? version.assets[0] : version.assets;
        return {
          id: version.id,
          label: `${document.title} · v${version.version}`,
          kind: document.kind,
          filename: asset?.original_filename ?? `${document.kind}.pdf`,
        };
      }),
  );

  return (
    <AppShell organizationName={organization.name} userName={userName}>
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
          <div><p className="eyebrow">Approved document delivery</p><h1>Send Center</h1><p>Choose an approved PDF, confirm recipients, and retain a permanent delivery record.</p></div>
          <Link className="secondary-button" href={`/jobs/${jobId}/review`}><FileCheck2 size={17} /> Back to Review</Link>
        </header>

        <div className="send-center-layout">
          <main className="send-compose-panel">
            {latestApproved ? (
              <form action={prepareReportDelivery}>
                <input name="jobId" type="hidden" value={jobId} />
                <section className="send-form-section">
                  <div className="section-heading compact"><div><p className="eyebrow">Document</p><h2>Approved report version</h2></div></div>
                  <label>
                    PDF version
                    <select name="versionId" defaultValue={latestApproved.id}>
                      {approvedVersions.map((version) => <option value={version.id} key={version.id}>Version {version.version} · approved {version.approvedAt ? new Date(version.approvedAt).toLocaleDateString() : ""}</option>)}
                    </select>
                  </label>
                  <Link className="text-button send-download-link" href={`/jobs/${jobId}/review/versions/${latestApproved.id}/download`}><Download size={15} /> Download selected PDF</Link>
                </section>

                <section className="send-form-section">
                  <div className="section-heading compact"><div><p className="eyebrow">Package</p><h2>What should the recipient receive?</h2></div><span className="section-subtitle">The delivery history records this choice.</span></div>
                  <div className="send-package-options">
                    <label><input name="packageMode" type="radio" value="report_only" defaultChecked /><span><strong>Report only</strong><small>Send the approved inspection report PDF.</small></span></label>
                    <label className={!supportingVersions.length ? "disabled" : ""}><input name="packageMode" type="radio" value="append_contract" disabled={!supportingVersions.length} /><span><strong>Report with contract appended</strong><small>Combine both documents into one PDF.</small></span></label>
                    <label className={!supportingVersions.length ? "disabled" : ""}><input name="packageMode" type="radio" value="separate_attachments" disabled={!supportingVersions.length} /><span><strong>Separate attachments</strong><small>Attach the report and contract as separate PDFs.</small></span></label>
                    <label className={!supportingVersions.length ? "disabled" : ""}><input name="packageMode" type="radio" value="contract_only" disabled={!supportingVersions.length} /><span><strong>Contract only</strong><small>Send only the selected contract or proposal.</small></span></label>
                  </div>
                  {supportingVersions.length ? (
                    <label>
                      Contract or proposal
                      <select name="supportingVersionId" defaultValue={supportingVersions[0].id}>
                        {supportingVersions.map((version) => <option key={version.id} value={version.id}>{version.label} · {version.filename}</option>)}
                      </select>
                    </label>
                  ) : <p className="send-package-empty">Report-only delivery is available now. Contract packaging will activate when this job has a ready contract or proposal version.</p>}
                </section>

                <section className="send-form-section">
                  <div className="section-heading compact"><div><p className="eyebrow">Recipients</p><h2>Send report to</h2></div><span className="section-subtitle">{uniqueRecipients.length} contacts with email</span></div>
                  {uniqueRecipients.length ? <div className="send-recipient-list">
                    {uniqueRecipients.map((recipient) => (
                      <label className="send-recipient" key={recipient.key}>
                        <input
                          defaultChecked={recipient.selected}
                          name="recipient"
                          type="checkbox"
                          value={JSON.stringify({ contactId: recipient.contactId, email: recipient.email, name: recipient.name, type: "to" })}
                        />
                        <div><strong>{recipient.name}</strong><span>{recipient.role} · {recipient.email}</span></div>
                      </label>
                    ))}
                  </div> : <div className="compact-empty"><Users size={22} /><div><strong>No contacts with email</strong><span>Add an email address before preparing delivery.</span></div></div>}
                </section>

                <section className="send-form-section send-message-fields">
                  <div className="section-heading compact"><div><p className="eyebrow">Message</p><h2>Email content</h2></div></div>
                  <label>Subject<input name="subject" defaultValue={`Inspection Report #${job.job_number} - ${property?.street_line_1 ?? "Property"}`} required /></label>
                  <label>Message<textarea name="message" rows={8} defaultValue={`Hello,\n\nPlease find attached the structural pest inspection report for ${reportAddress}.\n\nRegards,\n${organization.name}`} required /></label>
                </section>

                <div className="send-form-actions">
                  <button className="secondary-button" name="intent" value="draft" type="submit"><Clock3 size={16} /> Save draft</button>
                  <button className="primary-button" disabled={!uniqueRecipients.length} name="intent" value="send" type="submit"><Send size={16} /> Send approved report</button>
                </div>
              </form>
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
            <div className="section-heading compact"><div><p className="eyebrow">Audit trail</p><h2>Delivery history</h2></div><Mail size={18} /></div>
            {deliveries?.length ? <div className="delivery-history-list">
              {deliveries.map((delivery) => {
                const version = Array.isArray(delivery.document_versions) ? delivery.document_versions[0] : delivery.document_versions;
                return <article className="delivery-history-item" key={delivery.id}>
                  <div><strong>{delivery.subject}</strong><span>Version {version?.version ?? "?"} · {delivery.package_mode?.replaceAll("_", " ") ?? "report only"} · {delivery.status}</span></div>
                  <small>{delivery.sent_at ? `Sent ${new Date(delivery.sent_at).toLocaleString()}` : `Created ${new Date(delivery.created_at).toLocaleString()}`}</small>
                  <div className="delivery-recipient-chips">{(delivery.delivery_recipients ?? []).map((recipient) => <span key={recipient.id}>{recipient.display_name || recipient.email}</span>)}</div>
                  {delivery.failure_message ? <p>{delivery.failure_message}</p> : null}
                </article>;
              })}
            </div> : <p className="panel-empty-copy">No delivery activity yet.</p>}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
