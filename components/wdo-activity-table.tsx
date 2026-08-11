"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, ExternalLink, FileWarning, History } from "lucide-react";
import { generateWdoExport } from "@/app/compliance/wdo/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { CALIFORNIA_WDO_FEE_PER_ACTIVITY } from "@/lib/wdo/california/config";
import {
  type WdoQueueRow,
  wdoExportStatusLabel,
} from "@/lib/wdo/queue";

type WdoActivityTableProps = {
  rows: WdoQueueRow[];
  dateFrom: string;
  dateTo: string;
  idempotencyKey: string;
};

export function WdoActivityTable({ rows, dateFrom, dateTo, idempotencyKey }: WdoActivityTableProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectableIds = useMemo(
    () => rows.filter((row) => row.issues.length === 0).map((row) => row.id),
    [rows],
  );
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const hasReexports = selectedRows.some((row) => row.priorExports.length > 0);
  const allSelected = selectableIds.length > 0
    && selectableIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      if (allSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  return (
    <form action={generateWdoExport} className="wdo-export-form">
      <input name="selectedActivityIds" type="hidden" value={JSON.stringify([...selected])} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="dateFrom" type="hidden" value={dateFrom} />
      <input name="dateTo" type="hidden" value={dateTo} />

      <div className="wdo-selection-bar">
        <div>
          <strong>{selected.size} selected</strong>
          <span>Estimated SPCB filing fee: ${(selected.size * CALIFORNIA_WDO_FEE_PER_ACTIVITY).toFixed(2)}</span>
        </div>
        <PendingSubmitButton
          className="primary-button"
          disabled={!selected.size}
          pendingLabel="Generating WDO .TXT"
        >
          <Download size={16} /> Download WDO .TXT
        </PendingSubmitButton>
      </div>

      {hasReexports ? (
        <section className="wdo-reexport-warning">
          <FileWarning size={19} />
          <div>
            <strong>Previously generated activities selected</strong>
            <p>Earlier batches remain unchanged. Record why these activities are being generated again.</p>
            <label>
              Re-export reason
              <select name="reexportReason" required defaultValue="">
                <option value="" disabled>Select a reason</option>
                <option value="Corrected data">Corrected data</option>
                <option value="Previous file not submitted">Previous file not submitted</option>
                <option value="SPCB requested resubmission">SPCB requested resubmission</option>
                <option value="Replacement file">Replacement file</option>
                <option value="Other authorized re-export">Other</option>
              </select>
            </label>
          </div>
        </section>
      ) : null}

      <div className="wdo-table-wrap">
        <table className="wdo-table">
          <thead>
            <tr>
              <th className="wdo-check-cell">
                <input
                  aria-label="Select all ready rows shown"
                  checked={allSelected}
                  disabled={!selectableIds.length}
                  onChange={toggleAll}
                  type="checkbox"
                />
              </th>
              <th>Activity date</th>
              <th>Property</th>
              <th>Activity type</th>
              <th>Inspector</th>
              <th>License #</th>
              <th>Branch</th>
              <th>Filing deadline</th>
              <th>Export status</th>
              <th>Validation</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const ready = row.issues.length === 0;
              return (
                <tr key={row.id} className={ready ? "" : "needs-attention"}>
                  <td className="wdo-check-cell">
                    <input
                      aria-label={`Select ${row.property}`}
                      checked={selected.has(row.id)}
                      disabled={!ready}
                      onChange={() => toggle(row.id)}
                      type="checkbox"
                    />
                  </td>
                  <td>{row.activityDate ? new Date(`${row.activityDate}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC" }) : "Missing"}</td>
                  <td><strong>{row.property}</strong>{row.jobNumber ? <span>Job #{row.jobNumber}</span> : null}</td>
                  <td>{row.activityType}</td>
                  <td>{row.inspectorName}</td>
                  <td>{row.inspectorLicenseNumber || "Missing"}</td>
                  <td>{row.branchName}</td>
                  <td>
                    {row.deadline
                      ? <span className={`deadline-${row.deadline.tone}`}>{row.deadline.label}</span>
                      : <span className="deadline-attention">Needs activity date</span>}
                  </td>
                  <td>
                    <span className={`wdo-status status-${row.exportStatus}`}>
                      {wdoExportStatusLabel(row.exportStatus)}
                    </span>
                    {row.priorExports[0] ? (
                      <Link className="wdo-history-link" href={`/compliance/wdo/batches/${row.priorExports[0].batchId}`}>
                        <History size={12} /> {row.priorExports[0].filename}
                      </Link>
                    ) : null}
                  </td>
                  <td>
                    {ready ? (
                      <span className="wdo-validation ready">Ready</span>
                    ) : (
                      <details className="wdo-validation-details">
                        <summary><AlertTriangle size={13} /> Needs attention ({row.issues.length})</summary>
                        <ul>
                          {row.issues.map((issue) => (
                            <li key={`${issue.field}-${issue.code}`}>
                              {issue.href ? <Link href={issue.href}>{issue.message}</Link> : issue.message}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td>
                    <Link
                      aria-label={`Review WDO activity for ${row.property}`}
                      className="icon-button small"
                      href={`/compliance/wdo/activities/${row.id}`}
                    >
                      <ExternalLink size={15} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
