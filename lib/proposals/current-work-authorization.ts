import { proposalSnapshotContentHash } from "./snapshot-hash";

export type WorkAuthorizationVersion = {
  id: string;
  version: number;
  status: string;
  approvalStatus: string;
  snapshot: unknown;
  generatedAt?: string | null;
  kind?: string | null;
};

type ResolveCurrentWorkAuthorizationInput = {
  currentContentHash: string | null;
  versions: WorkAuthorizationVersion[];
  contentUpdatedAt?: number | null;
};

export function resolveCurrentWorkAuthorization({
  currentContentHash,
  versions,
  contentUpdatedAt = null,
}: ResolveCurrentWorkAuthorizationInput) {
  const approvedVersions = versions
    .filter(
      (version) =>
        version.status === "ready" && version.approvalStatus === "approved",
    )
    .sort((left, right) => {
      const leftKindPriority = left.kind === "contract" ? 1 : 0;
      const rightKindPriority = right.kind === "contract" ? 1 : 0;
      if (leftKindPriority !== rightKindPriority) {
        return rightKindPriority - leftKindPriority;
      }
      return right.version - left.version;
    });

  const latestApprovedVersion = approvedVersions[0] ?? null;
  let currentVersion = currentContentHash
    ? approvedVersions.find(
        (version) =>
          proposalSnapshotContentHash(version.snapshot) === currentContentHash,
      ) ?? null
    : null;

  // Older documents do not contain a content hash. Keep a narrow timestamp
  // fallback so they remain usable until the next generated version.
  if (
    !currentVersion &&
    !currentContentHash &&
    latestApprovedVersion?.generatedAt &&
    contentUpdatedAt
  ) {
    const generatedAt = new Date(latestApprovedVersion.generatedAt).getTime();
    if (Number.isFinite(generatedAt) && generatedAt + 5_000 >= contentUpdatedAt) {
      currentVersion = latestApprovedVersion;
    }
  }

  return {
    state: currentVersion
      ? ("ready" as const)
      : latestApprovedVersion
        ? ("outdated" as const)
        : ("missing" as const),
    currentVersion,
    latestApprovedVersion,
  };
}
