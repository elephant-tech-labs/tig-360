"use client";

import { FormEvent, useState } from "react";
import {
  Check,
  LoaderCircle,
  Mail,
  Plus,
  Star,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  assignContactToJob,
  removeJobParty,
} from "@/app/contacts/actions";
import { jobPartyRoleLabel, jobPartyRoles } from "@/lib/job-parties";

export type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  mobilePhone: string | null;
  jobTitle: string | null;
  companyName: string | null;
};

export type AssignedParty = {
  id: string;
  role: string;
  isPrimary: boolean;
  receiveReport: boolean;
  contact: ContactOption;
};

type JobContactManagerProps = {
  organizationId: string;
  jobId: string;
  initialParties: AssignedParty[];
  contacts: ContactOption[];
};

type Notice = {
  kind: "success" | "error";
  message: string;
} | null;

export function JobContactManager({
  organizationId,
  jobId,
  initialParties,
  contacts,
}: JobContactManagerProps) {
  const [parties, setParties] = useState(initialParties);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const groupedParties = Array.from(
    parties.reduce((groups, party) => {
      const current = groups.get(party.contact.id);
      if (current) {
        current.assignments.push(party);
      } else {
        groups.set(party.contact.id, {
          contact: party.contact,
          assignments: [party],
        });
      }
      return groups;
    }, new Map<string, { contact: ContactOption; assignments: AssignedParty[] }>()),
  ).map(([, group]) => group);

  async function handleAssign(
    event: FormEvent<HTMLFormElement>,
    contact: ContactOption,
  ) {
    event.preventDefault();
    if (pendingKey) return;

    const form = new FormData(event.currentTarget);
    const role = String(form.get("role") ?? "");
    const isPrimary = form.get("isPrimary") === "on";
    const receiveReport = form.get("receiveReport") === "on";
    const mutationKey = `assign:${contact.id}:${role}`;
    const snapshot = parties;
    const existing = parties.find(
      (party) => party.contact.id === contact.id && party.role === role,
    );
    const optimisticId = existing?.id ?? `optimistic:${contact.id}:${role}`;
    const optimisticParty: AssignedParty = {
      id: optimisticId,
      role,
      isPrimary,
      receiveReport: receiveReport || role === "report_recipient",
      contact,
    };

    setNotice(null);
    setPendingKey(mutationKey);
    setParties((current) => {
      const withoutExisting = current.filter(
        (party) => !(party.contact.id === contact.id && party.role === role),
      );
      const adjusted = isPrimary
        ? withoutExisting.map((party) =>
            party.role === role ? { ...party, isPrimary: false } : party,
          )
        : withoutExisting;
      return [optimisticParty, ...adjusted];
    });

    const result = await assignContactToJob({
      organizationId,
      jobId,
      contactId: contact.id,
      role,
      isPrimary,
      receiveReport,
    });

    if (!result.ok) {
      setParties(snapshot);
      setNotice({ kind: "error", message: result.message });
      setPendingKey(null);
      return;
    }

    if (result.partyId && result.partyId !== optimisticId) {
      setParties((current) =>
        current.map((party) =>
          party.id === optimisticId ? { ...party, id: result.partyId! } : party,
        ),
      );
    }
    setNotice({
      kind: "success",
      message: `${contact.firstName} ${contact.lastName} assigned as ${jobPartyRoleLabel(role)}.`,
    });
    setPendingKey(null);
  }

  async function handleRemove(party: AssignedParty) {
    if (pendingKey) return;

    const snapshot = parties;
    const mutationKey = `remove:${party.id}`;
    setNotice(null);
    setPendingKey(mutationKey);
    setParties((current) => current.filter((item) => item.id !== party.id));

    const result = await removeJobParty({
      organizationId,
      jobId,
      partyId: party.id,
    });

    if (!result.ok) {
      setParties(snapshot);
      setNotice({ kind: "error", message: result.message });
      setPendingKey(null);
      return;
    }

    setNotice({
      kind: "success",
      message: `${party.contact.firstName} ${party.contact.lastName} removed from ${jobPartyRoleLabel(party.role)}.`,
    });
    setPendingKey(null);
  }

  return (
    <>
      <div className="mutation-notice-slot" aria-live="polite" aria-atomic="true">
        {notice ? (
          <div className={`form-alert ${notice.kind}`}>
            {notice.kind === "success" ? <Check size={17} /> : null}
            {notice.message}
          </div>
        ) : null}
      </div>

      <section className="assignment-section">
        <div className="section-heading">
          <div>
            <h2>Contacts on this job</h2>
            <span className="section-subtitle">One person may hold several roles</span>
          </div>
        </div>

        {groupedParties.length ? (
          <div className="assigned-party-list">
            {groupedParties.map(({ contact, assignments }) => {
              const isOptimistic = assignments.some((party) => party.id.startsWith("optimistic:"));
              return (
                <article
                  className={`assigned-party-row ${isOptimistic ? "is-optimistic" : ""}`}
                  key={contact.id}
                >
                  <div className="contact-avatar">
                    {(contact.firstName[0] ?? "") +
                      (contact.lastName[0] ?? "")}
                  </div>
                  <div className="assigned-party-person">
                    <strong>
                      {contact.firstName} {contact.lastName}
                    </strong>
                    <span>
                      {contact.companyName ||
                        contact.email ||
                        "Contact"}
                    </span>
                  </div>
                  <div className="assigned-party-channel">
                    <Mail size={14} /> {contact.email || "No email"}
                  </div>
                  <div className="assigned-contact-roles">
                    {assignments.map((party) => {
                      const isRemoving = pendingKey === `remove:${party.id}`;
                      return (
                        <div className="assigned-role-line" key={party.id}>
                          <span className="role-badge">
                            {jobPartyRoleLabel(party.role)}
                          </span>
                          {party.isPrimary ? (
                            <span className="primary-marker" title="Primary contact for this role">
                              <Star size={12} /> Primary for role
                            </span>
                          ) : null}
                          {party.receiveReport ? (
                            <span className="send-default-marker" title="Preselected in Send Center">
                              <Mail size={12} /> Send Center default
                            </span>
                          ) : null}
                          <button
                            aria-label={`Remove ${contact.firstName} ${contact.lastName} from ${jobPartyRoleLabel(party.role)}`}
                            className="icon-button small danger-button"
                            disabled={Boolean(pendingKey)}
                            onClick={() => handleRemove(party)}
                            title={`Remove ${jobPartyRoleLabel(party.role)} role`}
                            type="button"
                          >
                            {isRemoving ? (
                              <LoaderCircle className="button-spinner" size={16} />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="compact-empty">
            <Users size={22} />
            <div>
              <strong>No contacts assigned</strong>
              <span>Select an existing contact below or create a new one.</span>
            </div>
          </div>
        )}
      </section>

      <section className="assignment-section">
        <div className="section-heading">
          <div>
            <h2>Assign an existing contact</h2>
            <span className="section-subtitle">
              {contacts.length} reusable contacts available
            </span>
          </div>
        </div>

        {contacts.length ? (
          <div className="contact-assignment-list">
            {contacts.map((contact) => (
              <form
                className="contact-assignment-row"
                key={contact.id}
                onSubmit={(event) => handleAssign(event, contact)}
              >
                <div className="contact-avatar">
                  {(contact.firstName[0] ?? "") + (contact.lastName[0] ?? "")}
                </div>
                <div className="contact-primary">
                  <strong>
                    {contact.firstName} {contact.lastName}
                  </strong>
                  <span>
                    {contact.jobTitle ||
                      contact.companyName ||
                      contact.email ||
                      "Contact"}
                  </span>
                </div>
                <select
                  aria-label={`Role for ${contact.firstName} ${contact.lastName}`}
                  disabled={Boolean(pendingKey)}
                  name="role"
                  defaultValue="report_recipient"
                >
                  {jobPartyRoles.map((role) => (
                    <option value={role.value} key={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <label className="inline-check">
                  <input disabled={Boolean(pendingKey)} name="isPrimary" type="checkbox" />
                  Primary for role
                </label>
                <label className="inline-check" title="Preselect this person when Send Center opens.">
                  <input disabled={Boolean(pendingKey)} name="receiveReport" type="checkbox" />
                  Send Center
                </label>
                <button
                  className="secondary-button"
                  disabled={Boolean(pendingKey)}
                  type="submit"
                >
                  {pendingKey?.startsWith(`assign:${contact.id}:`) ? (
                    <>
                      <LoaderCircle className="button-spinner" size={15} /> Saving
                    </>
                  ) : (
                    <>
                      <Plus size={15} /> Assign
                    </>
                  )}
                </button>
              </form>
            ))}
          </div>
        ) : (
          <div className="compact-empty">
            <UserPlus size={22} />
            <div>
              <strong>No reusable contacts yet</strong>
              <span>Create the first contact using the panel on this page.</span>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
