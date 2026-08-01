// Assembles the ONE `WorkloadContributions` registry the workloads engine dispatches through — the
// replacement for the retired `runner-env.ts` cross-feature hub. Each owning domain exports a standalone
// contribution FACTORY over its own verbs; this seam spreads them into a kind-keyed registry.
//
// THE COMPLETENESS PIN lives here: `keyByKind` asserts every `WORKLOAD_KINDS` member is contributed EXACTLY
// once (missing → boot throws; duplicate → boot throws), and the `WorkloadContributions` mapped type makes a
// missing kind a tsc error at this call site. A new job cannot be half-registered, and there is no shared hub
// left to bolt another domain's capability onto.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KINDS } from "@orb/contracts/workloads";
import type { ConnectionWorkloadDeps } from "#domain/connection";
import { createConnectionWorkloadContributions } from "#domain/connection";
import type { DiscoveryWorkloadDeps } from "#domain/discovery";
import { createDiscoveryWorkloadContributions } from "#domain/discovery";
import type { EmbeddingsWorkloadDeps } from "#domain/embeddings";
import { createEmbeddingsWorkloadContributions } from "#domain/embeddings";
import type { StatsWorkloadDeps } from "#domain/stats";
import { createStatsWorkloadContributions } from "#domain/stats";
import type { AnyWorkloadContribution, ShimContributionDeps, WorkloadContributions } from "#domain/workloads";
import { buildShimContributions } from "#domain/workloads";

/** What the registry seam needs from the composition root: each owning domain's contribution deps, plus
 *  (transitionally) what the not-yet-moved kinds' shim still reads. */
export interface WorkloadContributionsDeps
  extends ShimContributionDeps,
    EmbeddingsWorkloadDeps,
    DiscoveryWorkloadDeps,
    StatsWorkloadDeps,
    ConnectionWorkloadDeps {}

/** Key a flat contribution list by kind, asserting exhaustive + duplicate-free registration. */
function keyByKind(contributions: readonly AnyWorkloadContribution[]): WorkloadContributions {
  const byKind = new Map<WorkloadKind, AnyWorkloadContribution>();
  for (const contribution of contributions) {
    if (byKind.has(contribution.kind)) {
      throw new Error(`workload contributions: "${contribution.kind}" is contributed twice`);
    }
    byKind.set(contribution.kind, contribution);
  }
  const missing = WORKLOAD_KINDS.filter((kind) => !byKind.has(kind));
  if (missing.length > 0) {
    throw new Error(`workload contributions: no contribution for ${missing.join(", ")}`);
  }
  return Object.fromEntries(byKind) as WorkloadContributions;
}

/**
 * Build the registry. TRANSITIONAL (the junk-drawer exit): every kind still runs through
 * `buildShimContributions` (the surviving `runners/` over the old env hub) until its ownership move lands;
 * each stage replaces a slice of that shim with its domain's real factory, and the shim is deleted with the
 * last one.
 */
export function buildWorkloadContributions(deps: WorkloadContributionsDeps): WorkloadContributions {
  return keyByKind([
    ...createEmbeddingsWorkloadContributions(deps),
    ...createDiscoveryWorkloadContributions(deps),
    ...createStatsWorkloadContributions(deps),
    ...createConnectionWorkloadContributions(deps),
    ...buildShimContributions(deps),
  ]);
}
