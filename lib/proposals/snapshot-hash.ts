import { createHash } from "node:crypto";
import type { ProposalSnapshot } from "./types";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeMoney(value: number | null | undefined) {
  return Number(Number(value ?? 0).toFixed(2));
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, normalizeJson(child)]),
  );
}

export function buildProposalSnapshotHash(snapshot: ProposalSnapshot) {
  const normalized = {
    schemaVersion: snapshot.schemaVersion,
    organization: {
      id: snapshot.organization.id,
      name: normalizeText(snapshot.organization.name),
      legalName: normalizeText(snapshot.organization.legalName),
      streetLine1: normalizeText(snapshot.organization.streetLine1),
      streetLine2: normalizeText(snapshot.organization.streetLine2),
      city: normalizeText(snapshot.organization.city),
      region: normalizeText(snapshot.organization.region),
      postalCode: normalizeText(snapshot.organization.postalCode),
      phone: normalizeText(snapshot.organization.phone),
      email: normalizeText(snapshot.organization.email),
      website: normalizeText(snapshot.organization.website),
      registrationNumber: normalizeText(snapshot.organization.registrationNumber),
    },
    job: {
      id: snapshot.job.id,
      number: snapshot.job.number,
      reportType: normalizeText(snapshot.job.reportType),
      inspectionAt: snapshot.job.inspectionAt ?? null,
    },
    property: {
      streetLine1: normalizeText(snapshot.property.streetLine1),
      streetLine2: normalizeText(snapshot.property.streetLine2),
      city: normalizeText(snapshot.property.city),
      region: normalizeText(snapshot.property.region),
      postalCode: normalizeText(snapshot.property.postalCode),
    },
    proposal: {
      id: snapshot.proposal.id,
      title: normalizeText(snapshot.proposal.title),
      customerNote: normalizeText(snapshot.proposal.customerNote),
      customerSummary: normalizeText(snapshot.proposal.customerSummary),
      terms: normalizeText(snapshot.proposal.terms),
      subtotal: normalizeMoney(snapshot.proposal.subtotal),
      discount: normalizeMoney(snapshot.proposal.discount),
      tax: normalizeMoney(snapshot.proposal.tax),
      total: normalizeMoney(snapshot.proposal.total),
    },
    parties: snapshot.parties
      .map((party) => ({
        role: normalizeText(party.role),
        name: normalizeText(party.name),
        company: normalizeText(party.company),
        email: normalizeText(party.email).toLowerCase(),
      }))
      .sort((a, b) => `${a.role}:${a.email}:${a.name}`.localeCompare(`${b.role}:${b.email}:${b.name}`)),
    lines: snapshot.lines.map((line) => ({
      id: line.id,
      code: normalizeText(line.code),
      section: normalizeText(line.section),
      title: normalizeText(line.title),
      description: normalizeText(line.description),
      quantity: normalizeMoney(line.quantity),
      unitPrice: normalizeMoney(line.unitPrice),
      amount: normalizeMoney(line.amount),
    })),
    contractContent: snapshot.contractContent.map((block) => ({
      id: block.id,
      title: normalizeText(block.title),
      body: normalizeText(block.body),
      bodyJson: normalizeJson(block.bodyJson),
      sortOrder: block.sortOrder,
    })),
  };

  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
