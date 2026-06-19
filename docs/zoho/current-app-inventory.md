# Current Zoho Creator Application Inventory

Source backup: `trident-inspect360_v1_19-Jun-2026_15_05_54`

Backup date: June 19, 2026.

## Confirmed Forms

1. `Report_Details`
2. `Termite_Inspection_Drawing`
3. `Inspections_Findings_And_Recommendations`
4. `Findings_Recommendations`
5. `Termite_Report_Photos`
6. `Contract`

## Confirmed Pages

- `All_Reports`
- `Termite_Inspection_Report`
- `tig_termite_front_page`
- `tig_termite_drawing`
- `tig_termite_fr`
- `tig_termite_photos`
- `tig_termite_inpection_invoice`
- `tig_termite_contract`
- `tig_termite_inspection_summary`
- `tig_termite_inspection_report`
- `tig_termite_send_center`

## Confirmed Integrations

- Zoho WorkDrive
- Zoho CRM
- Zoho Sign
- Zoho Writer
- OpenAI

## Prototype Data Volume

| Dataset | Records |
|---|---:|
| Report Details | 25 |
| Drawings | 11 |
| Photo records | 16 |
| Findings and recommendations | 16 |
| Contracts | 7 |
| Contract quote rows | 5 |

## Proven Business Capabilities

- Complete, Limited, Supplemental, and Reinspection report types
- prior-report relationship for supplemental/reinspection work
- four job contact roles: Ordered By, Property Owner, Report Sent To, Party Of Interest
- property cover image
- editable Fabric.js diagram plus rendered image
- inspection photos
- findings, recommendations, categories, finding codes, risk/severity, and Section I/II classifications
- proposal rows derived from findings or entered freehand
- AI-generated inspection/contract summaries
- report PDF generation
- contract PDF merge and Zoho Sign request
- Send Center readiness and recipients

## Creator-Specific Constraints Not To Reproduce

- duplicated contact fields on every report
- two photo fields caused by a ten-image field limit
- newline-separated WorkDrive IDs and URLs
- WorkDrive/public-link synchronization solely to make PDF images render
- repeated workflow logic in every page snippet
- form-submit redirects between stages
- placeholder drawing record created only so a widget has a target
- many successive copies of the drawing widget
- broad generic Read/Write permissions instead of operational roles

## Current Workflow Summary

1. Create Report Details.
2. Create a placeholder drawing record.
3. Complete front-page/property/contact data.
4. Complete diagram, F&R, and photos.
5. Generate/view report.
6. Build contract/proposal from findings.
7. Generate contract PDF and send for signature.
8. Use Send Center for readiness and report delivery.

Invoice, treatment, crew sheet, final invoice, and NOC are visible in navigation but are not mature data modules in this backup.
