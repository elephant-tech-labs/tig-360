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
  propertyType: string | null;
};

type InspectionJobFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  organizationId: string;
  jobId?: string;
  cancelHref: string;
  submitLabel: string;
  pendingLabel: string;
  priorInspections: PriorInspectionOption[];
  initialValues?: {
    streetLine1: string;
    streetLine2: string;
    city: string;
    region: string;
    postalCode: string;
    propertyType: string;
    reportType: string;
    inspectionAt: string;
    priorJobId: string;
    internalNotes: string;
  };
};

const defaults = {
  streetLine1: "",
  streetLine2: "",
  city: "",
  region: "WA",
  postalCode: "",
  propertyType: "single_family",
  reportType: "complete",
  inspectionAt: "",
  priorJobId: "",
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
  initialValues,
}: InspectionJobFormProps) {
  const values = { ...defaults, ...initialValues };
  const [reportType, setReportType] = useState(values.reportType);
  const [selectedPriorId, setSelectedPriorId] = useState(values.priorJobId);
  const [property, setProperty] = useState({
    streetLine1: values.streetLine1,
    streetLine2: values.streetLine2,
    city: values.city,
    region: values.region,
    postalCode: values.postalCode,
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
      propertyType: prior.propertyType ?? "single_family",
    });
  }

  return (
    <form className="job-form" action={action}>
      <input name="organizationId" type="hidden" value={organizationId} />
      {jobId ? <input name="jobId" type="hidden" value={jobId} /> : null}

      <fieldset>
        <legend>Property</legend>
        <div className="field-grid">
          <label className="field-span-2">
            Street address
            <input
              name="streetLine1"
              autoComplete="address-line1"
              value={property.streetLine1}
              onChange={(event) =>
                setProperty((current) => ({ ...current, streetLine1: event.target.value }))
              }
              required
            />
          </label>
          <label className="field-span-2">
            Unit or secondary address
            <input
              name="streetLine2"
              autoComplete="address-line2"
              value={property.streetLine2}
              onChange={(event) =>
                setProperty((current) => ({ ...current, streetLine2: event.target.value }))
              }
            />
          </label>
          <label>
            City
            <input
              name="city"
              autoComplete="address-level2"
              value={property.city}
              onChange={(event) =>
                setProperty((current) => ({ ...current, city: event.target.value }))
              }
              required
            />
          </label>
          <label>
            State
            <input
              name="region"
              autoComplete="address-level1"
              maxLength={2}
              value={property.region}
              onChange={(event) =>
                setProperty((current) => ({ ...current, region: event.target.value }))
              }
              required
            />
          </label>
          <label>
            ZIP code
            <input
              name="postalCode"
              autoComplete="postal-code"
              value={property.postalCode}
              onChange={(event) =>
                setProperty((current) => ({ ...current, postalCode: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Property type
            <select
              name="propertyType"
              value={property.propertyType}
              onChange={(event) =>
                setProperty((current) => ({ ...current, propertyType: event.target.value }))
              }
            >
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
            <select
              name="reportType"
              value={reportType}
              onChange={(event) => {
                const nextType = event.target.value;
                setReportType(nextType);
                if (nextType !== "supplemental" && nextType !== "reinspection") {
                  setSelectedPriorId("");
                }
              }}
            >
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
        </div>

        {needsPrior ? (
          <div className="related-inspection-panel">
            <div className="related-inspection-heading">
              <Link2 size={18} />
              <div>
                <strong>Related prior inspection</strong>
                <span>Required for {reportType} reports</span>
              </div>
            </div>
            <label>
              Previous job
              <select
                name="priorJobId"
                value={selectedPriorId}
                onChange={(event) => selectPrior(event.target.value)}
                required
              >
                <option value="">Select a previous inspection</option>
                {priorInspections.map((inspection) => (
                  <option key={inspection.id} value={inspection.id}>
                    #{inspection.jobNumber} · {inspection.streetLine1} · {inspection.reportType.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            {selectedPrior ? (
              <div className="related-inspection-summary">
                <strong>Job #{selectedPrior.jobNumber}</strong>
                <span>
                  {selectedPrior.inspectionAt
                    ? new Date(selectedPrior.inspectionAt).toLocaleDateString()
                    : "Date not scheduled"}{" "}
                  · {selectedPrior.status.replaceAll("_", " ")}
                </span>
                <small>
                  {selectedPrior.streetLine1}, {selectedPrior.city}, {selectedPrior.region}{" "}
                  {selectedPrior.postalCode}
                </small>
              </div>
            ) : null}
          </div>
        ) : null}
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
        <PendingSubmitButton className="primary-button" pendingLabel={pendingLabel}>
          {submitLabel}
        </PendingSubmitButton>
      </div>
    </form>
  );
}
