import type { Hit, NearFieldDiff, NearPairCandidate } from "../contract/types.ts";
import { hitOf } from "./emit.ts";

function nearFieldDiffText(diff: NearFieldDiff): string {
  const renamed = diff.renamed.length === 0 ? "" : ` · renamed-same-type: ${diff.renamed.map((row) => `${row.from}→${row.to}`).join(", ")}`;
  const domainOnly = diff.domainOnly.length === 0 ? "" : ` · domain-only: ${diff.domainOnly.join(", ")}`;
  const contractsOnly = diff.contractsOnly.length === 0 ? "" : ` · contracts-only: ${diff.contractsOnly.join(", ")}`;
  return `${diff.sharedCount}/${diff.totalFields} shared (${diff.pct.toFixed(0)}%)${renamed}${domainOnly}${contractsOnly}`;
}

export function nearPairHit(candidate: NearPairCandidate): Hit {
  const hit = hitOf(candidate.domainDecl, "respell-near");
  hit.text = `${candidate.domainName}  ≈  @orb/contracts/${candidate.domain}::${candidate.contractsName}  —  ${nearFieldDiffText(candidate.diff)}`;
  return hit;
}
