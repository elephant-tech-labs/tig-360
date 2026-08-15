"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { CALIFORNIA_WDO_FIELD_WIDTHS } from "@/lib/wdo/california/config";
import { validateCaliforniaWdoInspectorLicense } from "@/lib/wdo/california/validator";

export type PriorInspectionOption = {
  id: string;
  jobNumber: number;
  reportType: string;
  status: string;
  inspectionAt: string | null;
  buildingNumber: string | null;
  streetName: string | null;
  unitOrSuite: string | null;
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
    buildingNumber: string;
    streetName: string;
    unitOrSuite: string;
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
    wdoFilingRequirement: "required" | "not_required";
    wdoExclusionReason: string;
    wdoExclusionNotes: string;
  };
};

const defaults = {
  buildingNumber: "",
  streetName: "",
  unitOrSuite: "",
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
  wdoFilingRequirement: "required" as const,
  wdoExclusionReason: "",
  wdoExclusionNotes: "",
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
  const [wdoFilingRequirement, setWdoFilingRequirement] = useState(values.wdoFilingRequirement);
  const [wdoExclusionReason, setWdoExclusionReason] = useState(values.wdoExclusionReason);
  const [property, setProperty] = useState({
    buildingNumber: values.buildingNumber,
    streetName: values.streetName,
    unitOrSuite: values.unitOrSuite,
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
      buildingNumber: prior.buildingNumber ?? "",
      streetName: prior.streetName ?? "",
      unitOrSuite: prior.unitOrSuite ?? "",
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
  const inspectorLicenseIssue = selectedInspector
    ? validateCaliforniaWdoInspectorLicense(selectedInspector.licenseNumber)
    : "Select the responsible inspector before report completion.";

  return (
    <form className="job-form" action={action}>
      <input name="organizationId" type="hidden" value={organizationId} />
      {jobId ? <input name="jobId" type="hidden" value={jobId} /> : null}

      <fieldset id="property-address">
        <legend>Property</legend>
        <div className="field-grid">
          <label>
            Building number
            <input name="buildingNumber" autoComplete="address-line1" maxLength={!jobId || wdoFilingRequirement === "required" ? CALIFORNIA_WDO_FIELD_WIDTHS.buildingNumber : undefined} value={property.buildingNumber} onChange={(event) => setProperty((current) => ({ ...current, buildingNumber: event.target.value }))} required={!jobId || wdoFilingRequirement === "required"} />
          </label>
          <label>
            Street name
            <input name="streetName" autoComplete="address-line1" maxLength={!jobId || wdoFilingRequirement === "required" ? CALIFORNIA_WDO_FIELD_WIDTHS.street : undefined} value={property.streetName} onChange={(event) => setProperty((current) => ({ ...current, streetName: event.target.value }))} required={!jobId || wdoFilingRequirement === "required"} />
          </label>
          <label>
            Unit or suite
            <input name="unitOrSuite" autoComplete="address-line2" value={property.unitOrSuite} onChange={(event) => setProperty((current) => ({ ...current, unitOrSuite: event.target.value }))} />
          </label>
          <label>
            City
            <input name="city" autoComplete="address-level2" maxLength={!jobId || wdoFilingRequirement === "required" ? CALIFORNIA_WDO_FIELD_WIDTHS.city : undefined} value={property.city} onChange={(event) => setProperty((current) => ({ ...current, city: event.target.value }))} required={!jobId || wdoFilingRequirement === "required"} />
          </label>
          <div className="field-display"><span>State</span><strong>California (CA)</strong><small>Fixed for Trident inspection jobs.</small></div>
          <label>
            ZIP code
            <input name="postalCode" autoComplete="postal-code" inputMode="numeric" pattern={!jobId || wdoFilingRequirement === "required" ? "[0-9]{5}([0-9]{4})?" : undefined} maxLength={!jobId || wdoFilingRequirement === "required" ? CALIFORNIA_WDO_FIELD_WIDTHS.zipCode : undefined} value={property.postalCode} onChange={(event) => setProperty((current) => ({ ...current, postalCode: event.target.value }))} required={!jobId || wdoFilingRequirement === "required"} />
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
            {selectedInspector ? (
              <span className={inspectorLicenseIssue ? "field-help warning" : "field-help success"}>
                {inspectorLicenseIssue
                  ? `WDO not ready: ${inspectorLicenseIssue}`
                  : `WDO ready · SPCB ${selectedInspector.licenseNumber}`}
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

      <fieldset id="wdo-filing">
        <legend>California WDO filing</legend>
        <div className="field-grid">
          <label>
            Filing requirement
            <select name="wdoFilingRequirement" value={wdoFilingRequirement} onChange={(event) => setWdoFilingRequirement(event.target.value as "required" | "not_required")}>
              <option value="required">Required</option>
              <option value="not_required">Not required</option>
            </select>
            <span className="field-help">Normal inspection jobs are reportable by default.</span>
          </label>
          {wdoFilingRequirement === "not_required" ? (
            <>
              <label>
                Exclusion reason
                <select name="wdoExclusionReason" value={wdoExclusionReason} onChange={(event) => setWdoExclusionReason(event.target.value)} required>
                  <option value="">Choose a reason</option>
                  <option value="test_or_training">Test or training record</option>
                  <option value="created_in_error_or_duplicate">Created in error or duplicate</option>
                  <option value="inspection_never_commenced">Inspection never commenced</option>
                  <option value="other_non_reportable">Other non-reportable reason</option>
                </select>
              </label>
              <label className="field-span-2">
                Exclusion notes {wdoExclusionReason === "other_non_reportable" ? "(required)" : "(optional)"}
                <textarea name="wdoExclusionNotes" rows={3} defaultValue={values.wdoExclusionNotes} required={wdoExclusionReason === "other_non_reportable"} />
                <span className="field-help">This decision is audited. Existing generated or filed export history is never deleted.</span>
              </label>
            </>
          ) : null}
        </div>
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
