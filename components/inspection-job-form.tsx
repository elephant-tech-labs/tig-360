"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export type PriorInspectionOption = {
  id: string;
  jobNumber: number;
  reportType: string;
  status: string;
  inspectionAt: string | null;
  streetLine1: string;
  streetLine2: string | null;
  city: string;
  region: string;
  postalCode: string;
  county: string | null;
  propertyType: string | null;
};

export type InspectorOption = {
  userId: string;
  name: string;
  email: string | null;
  licenseNumber: string | null;
  hasSignature: boolean;
};

type InspectionJobFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  organizationId: string;
  jobId?: string;
  cancelHref: string;
  submitLabel: string;
  pendingLabel: string;
  priorInspections: PriorInspectionOption[];
  inspectors: InspectorOption[];
  initialValues?: {
    streetLine1: string;
    streetLine2: string;
    city: string;
    region: string;
    postalCode: string;
    county: string;
    propertyType: string;
    reportType: string;
    inspectionAt: string;
    priorJobId: string;
    generalDescription: string;
    escrowNumber: string;
    inspectionTagPosted: string;
    otherTagsPosted: string;
    garageDescription: string;
    inspectedById: string;
    includeInspectorSignature: boolean;
    internalNotes: string;
  };
};

const defaults = {
  streetLine1: "",
  streetLine2: "",
  city: "",
  region: "CA",
  postalCode: "",
  county: "",
  propertyType: "single_family",
  reportType: "complete",
  inspectionAt: "",
  priorJobId: "",
  generalDescription: "",
  escrowNumber: "",
  inspectionTagPosted: "",
  otherTagsPosted: "",
  garageDescription: "",
  inspectedById: "",
  includeInspectorSignature: true,
  internalNotes: "",
};

export function InspectionJobForm({
  action,
  organizationId,
  jobId,
  cancelHref,
  submitLabel,
  pendingLabel,
  priorInspections,
  inspectors,
  initialValues,
}: InspectionJobFormProps) {
  const values = { ...defaults, ...initialValues };
  const [reportType, setReportType] = useState(values.reportType);
  const [selectedPriorId, setSelectedPriorId] = useState(values.priorJobId);
  const [selectedInspectorId, setSelectedInspectorId] = useState(values.inspectedById);
  const [property, setProperty] = useState({
    streetLine1: values.streetLine1,
    streetLine2: values.streetLine2,
    city: values.city,
    region: values.region,
    postalCode: values.postalCode,
    county: values.county,
    propertyType: values.propertyType,
  });
  const needsPrior = reportType === "supplemental" || reportType === "reinspection";
  const selectedPrior = useMemo(
    () => priorInspections.find((inspection) => inspection.id === selectedPriorId),
    [priorInspections, selectedPriorId],
  );

  function selectPrior(priorId: string) {
    setSelectedPriorId(priorId);
    const prior = priorInspections.find((inspection) => inspection.id === priorId);
    if (!prior) return;
    setProperty({
      streetLine1: prior.streetLine1,
      streetLine2: prior.streetLine2 ?? "",
      city: prior.city,
      region: prior.region,
      postalCode: prior.postalCode,
      county: prior.county ?? "",
      propertyType: prior.propertyType ?? "single_family",
    });
  }

  const selectedInspector = inspectors.find(
    (inspector) => inspector.userId === selectedInspectorId,
  );

  return (
    <form className="job-form" action={action}>
      <input name="organizationId" type="hidden" value={organizationId} />
      {jobId ? <input name="jobId" type="hidden" value={jobId} /> : null}

      <fieldset>
        <legend>Property</legend>
        <div className="field-grid">
          <label className="field-span-2">
            Street address
            <input name="streetLine1" autoComplete="address-line1" value={property.streetLine1} onChange={(event) => setProperty((current) => ({ ...current, streetLine1: event.target.value }))} required />
          </label>
          <label className="field-span-2">
            Unit or secondary address
            <input name="streetLine2" autoComplete="address-line2" value={property.streetLine2} onChange={(event) => setProperty((current) => ({ ...current, streetLine2: event.target.value }))} />
          </label>
          <label>
            City
            <input name="city" autoComplete="address-level2" value={property.city} onChange={(event) => setProperty((current) => ({ ...current, city: event.target.value }))} required />
          </label>
          <label>
            State
            <input name="region" autoComplete="address-level1" maxLength={2} value={property.region} onChange={(event) => setProperty((current) => ({ ...current, region: event.target.value }))} required />
          </label>
          <label>
            ZIP code
            <input name="postalCode" autoComplete="postal-code" value={property.postalCode} onChange={(event) => setProperty((current) => ({ ...current, postalCode: event.target.value }))} required />
          </label>
          <label>
            County
            <input name="county" value={property.county} onChange={(event) => setProperty((current) => ({ ...current, county: event.target.value }))} />
          </label>
          <label>
            Property type
            <select name="propertyType" value={property.propertyType} onChange={(event) => setProperty((current) => ({ ...current, propertyType: event.target.value }))}>
              <option value="single_family">Single-family residence</option>
              <option value="multi_family">Multi-family residence</option>
              <option value="commercial">Commercial</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Inspection</legend>
        <div className="field-grid">
          <label>
            Report type
            <select name="reportType" value={reportType} onChange={(event) => { const nextType = event.target.value; setReportType(nextType); if (nextType !== "supplemental" && nextType !== "reinspection") setSelectedPriorId(""); }}>
              <option value="complete">Complete</option>
              <option value="limited">Limited</option>
              <option value="supplemental">Supplemental</option>
              <option value="reinspection">Reinspection</option>
            </select>
          </label>
          <label>
            Inspection date and time
            <input name="inspectionAt" type="datetime-local" defaultValue={values.inspectionAt} />
          </label>
          <label>
            Inspected by
            <select
              name="inspectedById"
              value={selectedInspectorId}
              onChange={(event) => setSelectedInspectorId(event.target.value)}
            >
              <option value="">Select inspector</option>
              {inspectors.map((inspector) => (
                <option value={inspector.userId} key={inspector.userId}>
                  {inspector.name}{inspector.licenseNumber ? ` · ${inspector.licenseNumber}` : ""}
                </option>
              ))}
            </select>
            {inspectors.length === 0 ? (
              <span className="field-help">
                No inspector profiles yet. <Link href="/team/inspectors">Set up inspectors</Link>.
              </span>
            ) : null}
          </label>
          <div className="inspector-signature-control">
            <label className="inline-check">
              <input
                name="includeInspectorSignature"
                type="checkbox"
                defaultChecked={values.includeInspectorSignature}
              />
              Include inspector signature in final report
            </label>
            <span className={selectedInspector?.hasSignature ? "signature-ready" : "signature-missing"}>
              {!selectedInspector
                ? "Choose an inspector to check signature availability."
                : selectedInspector.hasSignature
                  ? "Stored signature is ready."
                  : "No signature is stored for this inspector."}
            </span>
          </div>
        </div>

        {needsPrior ? (
          <div className="related-inspection-panel">
            <div className="related-inspection-heading">
              <Link2 size={18} />
              <div><strong>Related prior inspection</strong><span>Required for {reportType} reports</span></div>
            </div>
            <label>
              Previous job
              <select name="priorJobId" value={selectedPriorId} onChange={(event) => selectPrior(event.target.value)} required>
                <option value="">Select a previous inspection</option>
                {priorInspections.map((inspection) => (
                  <option key={inspection.id} value={inspection.id}>#{inspection.jobNumber} · {inspection.streetLine1} · {inspection.reportType.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            {selectedPrior ? (
              <div className="related-inspection-summary">
                <strong>Job #{selectedPrior.jobNumber}</strong>
                <span>{selectedPrior.inspectionAt ? new Date(selectedPrior.inspectionAt).toLocaleDateString() : "Date not scheduled"} · {selectedPrior.status.replaceAll("_", " ")}</span>
                <small>{selectedPrior.streetLine1}, {selectedPrior.city}, {selectedPrior.region} {selectedPrior.postalCode}</small>
              </div>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend>Report details</legend>
        <div className="field-grid">
          <label>
            Escrow number
            <input name="escrowNumber" defaultValue={values.escrowNumber} autoComplete="off" />
          </label>
          <label>
            Inspection tag posted
            <input name="inspectionTagPosted" defaultValue={values.inspectionTagPosted} placeholder="Example: Attic, garage, kitchen" />
          </label>
          <label>
            Other tags observed
            <input name="otherTagsPosted" defaultValue={values.otherTagsPosted} placeholder="Prior inspection, treatment, or fumigation tags" />
          </label>
          <label>
            Garage description
            <input name="garageDescription" defaultValue={values.garageDescription} placeholder="Example: Attached two-car garage" />
          </label>
          <label className="field-span-2">
            General description
            <textarea name="generalDescription" rows={5} defaultValue={values.generalDescription} />
          </label>
        </div>
      </fieldset>

      {jobId ? (
        <fieldset>
          <legend>Internal</legend>
          <label>
            Internal notes
            <textarea name="internalNotes" rows={4} defaultValue={values.internalNotes} />
          </label>
        </fieldset>
      ) : null}

      <div className="form-actions">
        <Link className="secondary-button" href={cancelHref}>Cancel</Link>
        <PendingSubmitButton className="primary-button" pendingLabel={pendingLabel}>{submitLabel}</PendingSubmitButton>
      </div>
    </form>
  );
}
