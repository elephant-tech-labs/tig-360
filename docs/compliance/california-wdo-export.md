# California WDO Activity Export

## Scope

This module manages California WDO regulatory activities independently from inspection jobs,
PDF report versions, and SPCB export batches. It supports Trident's verified principal-office
workflow and deliberately blocks branch-office TXT generation until the BR serialization layout
is established by official technical documentation or a known-good branch fixture.

## Serializer compatibility

- Serializer version: `ca-wdo-termitekiosk-206-v1`
- One record per line
- 206 printable ASCII characters per record, excluding the line ending
- CRLF (`\r\n`) line endings
- No header, trailer, delimiter, tab, or silent truncation
- Filename convention: `WDO_<PR>_YYYYMMDD_HHMM.TXT`

The private production fixture `WDO_LOG_20260809_1130.TXT` was inspected locally and was not
copied into this repository. It contained 66 records; every record was 206 characters and every
line used CRLF. The committed fixture at
`tests/fixtures/california-wdo-golden.TXT` uses fake company, property, and license data while
preserving the exact byte structure.

## Fixed-width fields

| Field | Position | Width |
| --- | ---: | ---: |
| Company name | 1-50 | 50 |
| Principal registration | 51-70 | 20 |
| Activity date (`MM/DD/YYYY`) | 71-80 | 10 |
| Building number | 81-86 | 6 |
| Street and unit | 87-136 | 50 |
| City | 137-186 | 50 |
| ZIP code | 187-195 | 9 |
| Inspector license | 196-205 | 10 |
| Activity code | 206 | 1 |

## Data ownership

- `organization_report_profiles.legal_name` and `registration_number` remain the company and
  principal-registration sources.
- `properties` remains the canonical property source. A `wdo_activities` row may hold a
  regulatory-only address override when the canonical street cannot be transformed safely.
- `inspectors.license_number` remains the license source.
- Inspection activities are created from `inspection_jobs`, but WDO activity existence does not
  depend on PDF generation or approval.
- Completion, corrected, and separated-report activities can be created explicitly until a
  dedicated treatment-completion source exists.

## Batch and filing semantics

Creating and downloading a batch means only that TIG generated a deterministic TXT. Every batch
stores the serializer version, exact normalized row snapshots, row order, and SHA-256 checksum.
Batch items cannot be changed or deleted. Re-export creates a new batch and requires a reason;
previous history is retained.

A generated batch becomes Filed only when an authorized user records the SPCB submitted date and
submittal number. Browser download completion is never treated as filing proof.

## Regulatory configuration

The application currently uses:

- 10 business days for the deadline display, excluding weekends;
- $5 per activity for the filing-fee estimate;
- official activity labels 1 through 7 from SPCB Form 43M-52.

Holiday handling is not implemented. Deadline and fee values are isolated in
`lib/wdo/california/config.ts` so rules can be updated without changing activity records or batch
history.

## Deployment and verification

1. Review and apply `supabase/migrations/20260811123000_california_wdo_activity_export.sql`.
2. Run `supabase/verification/20260811123000_california_wdo_activity_export_check.sql`.
3. Run the reconciliation action from Compliance → WDO Activity Export.
4. Configure the legal company name and SPCB Principal Registration in Management.
5. Resolve missing activity dates, addresses, inspectors, and inspector licenses.
6. Recreate one or two historical activities from the private TermiteKiosk fixture.
7. Compare TIG output byte-for-byte with the expected 206-position records.
8. Perform a controlled SPCB Connect upload and verify that Connect accepts the file.
9. Submit the selected pending activities in Connect and record the returned submittal number in
   TIG before treating the batch as Filed.

## Known limitations

- Branch registration is required when a branch issues the report or completion notice, but the
  observed 206-character production fixture has no separately identifiable BR field. TIG stores
  branch records and assignments but blocks their serialization.
- SPCB Connect acceptance is still required before relying on TIG for live filing.
- The deadline calculator excludes weekends but not California holidays.
