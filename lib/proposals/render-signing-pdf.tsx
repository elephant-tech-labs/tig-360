import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { ProposalContractPdf } from "@/lib/proposals/pdf-document";
import type { ProposalSnapshot } from "@/lib/proposals/types";

export async function renderProposalSigningPdf(
  snapshot: ProposalSnapshot,
  version: number,
  title: string,
) {
  const buffer = await renderToBuffer(
    <ProposalContractPdf snapshot={snapshot} variant="signing" />,
  );

  return {
    bytes: new Uint8Array(buffer),
    filename: `Proposal_Contract_${snapshot.job.number}_v${version}_signing.pdf`,
    title,
    version,
    snapshot,
  };
}
