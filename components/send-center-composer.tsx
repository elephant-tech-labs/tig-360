"use client";

import { useMemo, useState } from "react";
import {
  Clock3,
  Download,
  MailPlus,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { prepareReportDelivery } from "@/app/jobs/[jobId]/send/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type RecipientType = "to" | "cc" | "bcc";

export type SendCenterRecipient = {
  key: string;
  contactId: string | null;
  name: string;
  email: string;
  roles: string[];
  selected: boolean;
  type: RecipientType;
  channelLabel?: string;
};

export type SendCenterVersion = {
  id: string;
  version: number;
  approvedLabel: string;
};

export type SendCenterSupportingVersion = {
  id: string;
  label: string;
  filename: string;
};

export type SendCenterDraft = {
  id: string | null;
  versionId: string;
  packageMode: string;
  supportingVersionId: string;
  subject: string;
  message: string;
  replyTo: string;
  recipients: Array<{
    contactId: string | null;
    email: string;
    name: string;
    type: RecipientType;
  }>;
};

type ComposerProps = {
  jobId: string;
  versions: SendCenterVersion[];
  supportingVersions: SendCenterSupportingVersion[];
  directoryRecipients: SendCenterRecipient[];
  initialDraft: SendCenterDraft;
  downloadHref: string;
  providerLabel: string | null;
};

type RecipientState = Record<string, { selected: boolean; type: RecipientType }>;

type ManualRecipient = {
  id: string;
  name: string;
  email: string;
  type: RecipientType;
};

function recipientKey(email: string) {
  return email.trim().toLowerCase();
}

export function SendCenterComposer({
  jobId,
  versions,
  supportingVersions,
  directoryRecipients,
  initialDraft,
  downloadHref,
  providerLabel,
}: ComposerProps) {
  const initialDirectoryState = Object.fromEntries(
    directoryRecipients.map((recipient) => [
      recipient.key,
      { selected: recipient.selected, type: recipient.type },
    ]),
  );
  const directoryEmails = new Set(directoryRecipients.map((recipient) => recipientKey(recipient.email)));
  const initialManual = initialDraft.recipients
    .filter((recipient) => !directoryEmails.has(recipientKey(recipient.email)))
    .map((recipient, index) => ({
      ...recipient,
      id: `saved-${index}-${recipientKey(recipient.email)}`,
    }));
  const [recipientState, setRecipientState] = useState<RecipientState>(initialDirectoryState);
  const [manualRecipients, setManualRecipients] = useState<ManualRecipient[]>(initialManual);
  const [packageMode, setPackageMode] = useState(initialDraft.packageMode || "report_only");

  const selectedRecipients = useMemo(() => {
    const directory = directoryRecipients.flatMap((recipient) => {
      const state = recipientState[recipient.key];
      if (!state?.selected) return [];
      return [{
        contactId: recipient.contactId,
        email: recipient.email,
        name: recipient.name,
        type: state.type,
      }];
    });
    const manual = manualRecipients
      .filter((recipient) => recipient.email.trim())
      .map((recipient) => ({ ...recipient, contactId: null }));
    const unique = new Map<string, (typeof directory)[number]>();
    [...directory, ...manual].forEach((recipient) => {
      unique.set(`${recipientKey(recipient.email)}:${recipient.type}`, recipient);
    });
    return Array.from(unique.values());
  }, [directoryRecipients, manualRecipients, recipientState]);

  const hasToRecipient = selectedRecipients.some((recipient) => recipient.type === "to");
  const packageNeedsSupporting = packageMode !== "report_only";

  function updateRecipient(key: string, update: Partial<RecipientState[string]>) {
    setRecipientState((current) => ({
      ...current,
      [key]: { ...current[key], ...update },
    }));
  }

  function addManualRecipient() {
    setManualRecipients((current) => [
      ...current,
      { id: crypto.randomUUID(), name: "", email: "", type: "to" },
    ]);
  }

  function updateManualRecipient(id: string, update: Partial<ManualRecipient>) {
    setManualRecipients((current) =>
      current.map((recipient) => recipient.id === id ? { ...recipient, ...update } : recipient),
    );
  }

  return (
    <form action={prepareReportDelivery}>
      <input name="jobId" type="hidden" value={jobId} />
      <input name="deliveryId" type="hidden" value={initialDraft.id ?? ""} />
      {selectedRecipients.map((recipient) => (
        <input
          key={`${recipientKey(recipient.email)}:${recipient.type}`}
          name="recipient"
          type="hidden"
          value={JSON.stringify(recipient)}
        />
      ))}

      <section className="send-form-section">
        <div className="section-heading compact">
          <div><p className="eyebrow">Document</p><h2>Approved report version</h2></div>
          {initialDraft.id ? <span className="draft-indicator">Editing saved draft</span> : null}
        </div>
        <label>
          PDF version
          <select name="versionId" defaultValue={initialDraft.versionId}>
            {versions.map((version) => (
              <option value={version.id} key={version.id}>
                Version {version.version} · approved {version.approvedLabel}
              </option>
            ))}
          </select>
        </label>
        <a className="text-button send-download-link" href={downloadHref}>
          <Download size={15} /> Download latest approved PDF
        </a>
      </section>

      <section className="send-form-section">
        <div className="section-heading compact">
          <div><p className="eyebrow">Package</p><h2>Attachments</h2></div>
          <span className="section-subtitle">Every send preserves this exact choice.</span>
        </div>
        <div className="send-package-options">
          {[
            ["report_only", "Report only", "The approved inspection report PDF."],
            ["append_contract", "Report with contract appended", "One combined PDF in report-first order."],
            ["separate_attachments", "Separate attachments", "Report and contract remain separate files."],
            ["contract_only", "Contract only", "Only the selected contract or proposal."],
          ].map(([value, title, description]) => {
            const disabled = value !== "report_only" && !supportingVersions.length;
            return (
              <label className={disabled ? "disabled" : ""} key={value}>
                <input
                  checked={packageMode === value}
                  disabled={disabled}
                  name="packageMode"
                  onChange={() => setPackageMode(value)}
                  type="radio"
                  value={value}
                />
                <span><strong>{title}</strong><small>{description}</small></span>
              </label>
            );
          })}
        </div>
        {supportingVersions.length ? (
          <label>
            Contract or proposal
            <select
              disabled={!packageNeedsSupporting}
              name="supportingVersionId"
              defaultValue={initialDraft.supportingVersionId || supportingVersions[0].id}
            >
              {supportingVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label} · {version.filename}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="send-package-empty">
            Report-only delivery is available. Contract packaging activates when a ready contract or proposal exists.
          </p>
        )}
      </section>

      <section className="send-form-section">
        <div className="section-heading compact">
          <div><p className="eyebrow">Recipients</p><h2>Delivery list</h2></div>
          <span className="section-subtitle">{selectedRecipients.length} selected</span>
        </div>
        {directoryRecipients.length ? (
          <div className="send-recipient-list">
            {directoryRecipients.map((recipient) => {
              const state = recipientState[recipient.key];
              return (
                <div className={`send-recipient ${state?.selected ? "selected" : ""}`} key={recipient.key}>
                  <input
                    aria-label={`Select ${recipient.name}`}
                    checked={Boolean(state?.selected)}
                    onChange={(event) => updateRecipient(recipient.key, { selected: event.target.checked })}
                    type="checkbox"
                  />
                  <div>
                    <strong>{recipient.name}</strong>
                    <span>{recipient.roles.join(" · ")} · {recipient.email}{recipient.channelLabel ? ` · ${recipient.channelLabel}` : ""}</span>
                  </div>
                  <select
                    aria-label={`Recipient type for ${recipient.name}`}
                    disabled={!state?.selected}
                    onChange={(event) => updateRecipient(recipient.key, { type: event.target.value as RecipientType })}
                    value={state?.type ?? "to"}
                  >
                    <option value="to">To</option>
                    <option value="cc">CC</option>
                    <option value="bcc">BCC</option>
                  </select>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="compact-empty">
            <Users size={22} />
            <div><strong>No job contacts with email</strong><span>Add a manual recipient below or update job contacts.</span></div>
          </div>
        )}

        <div className="manual-recipient-heading">
          <div><MailPlus size={17} /><strong>Additional recipients</strong></div>
          <button className="text-button" onClick={addManualRecipient} type="button"><Plus size={14} /> Add recipient</button>
        </div>
        {manualRecipients.length ? (
          <div className="manual-recipient-list">
            {manualRecipients.map((recipient) => (
              <div className="manual-recipient-row" key={recipient.id}>
                <input
                  aria-label="Recipient name"
                  onChange={(event) => updateManualRecipient(recipient.id, { name: event.target.value })}
                  placeholder="Name"
                  value={recipient.name}
                />
                <input
                  aria-label="Recipient email"
                  onChange={(event) => updateManualRecipient(recipient.id, { email: event.target.value })}
                  placeholder="email@example.com"
                  type="email"
                  value={recipient.email}
                />
                <select
                  aria-label="Recipient type"
                  onChange={(event) => updateManualRecipient(recipient.id, { type: event.target.value as RecipientType })}
                  value={recipient.type}
                >
                  <option value="to">To</option>
                  <option value="cc">CC</option>
                  <option value="bcc">BCC</option>
                </select>
                <button
                  aria-label="Remove recipient"
                  className="icon-button small danger-button"
                  onClick={() => setManualRecipients((current) => current.filter((item) => item.id !== recipient.id))}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {!hasToRecipient && selectedRecipients.length ? (
          <p className="field-warning">At least one selected recipient must be marked To before sending.</p>
        ) : null}
      </section>

      <section className="send-form-section send-message-fields">
        <div className="section-heading compact"><div><p className="eyebrow">Message</p><h2>Email content</h2></div></div>
        <label>Subject<input name="subject" defaultValue={initialDraft.subject} required /></label>
        <label>Reply-to email<input name="replyTo" defaultValue={initialDraft.replyTo} type="email" /></label>
        <label>Message<textarea name="message" rows={8} defaultValue={initialDraft.message} required /></label>
      </section>

      <div className="send-provider-note">
        <span>Delivery provider</span>
        <strong>{providerLabel ?? "Not configured"}</strong>
      </div>
      <div className="send-form-actions">
        <PendingSubmitButton className="secondary-button" name="intent" pendingLabel="Saving draft" value="draft">
          <Clock3 size={16} /> Save draft
        </PendingSubmitButton>
        <PendingSubmitButton
          className="primary-button"
          disabled={!providerLabel || !hasToRecipient}
          name="intent"
          pendingLabel="Sending report"
          value="send"
        >
          <Send size={16} /> Send approved report
        </PendingSubmitButton>
      </div>
    </form>
  );
}
