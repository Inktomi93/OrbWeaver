// Assembles the ONE `WorkloadContributions` registry the workloads engine dispatches through — the
// replacement for the RETIRED `runner-env.ts` cross-feature hub (deleted with its last runner). Each owning
// domain exports a standalone contribution FACTORY over its own verbs; this seam spreads them into a
// kind-keyed registry. `reconcile-world-state` is the one exception: a RESERVED kind with no owner yet, so
// workloads carries it as an inert stub (zero domain knowledge, which is what makes that legal).
//
// THE COMPLETENESS PIN lives here: `keyByKind` asserts every `WORKLOAD_KINDS` member is contributed EXACTLY
// once (missing → boot throws; duplicate → boot throws), and the `WorkloadContributions` mapped type makes a
// missing kind a tsc error at this call site. A new job cannot be half-registered, and there is no shared hub
// left to bolt another domain's capability onto.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KINDS } from "@orb/contracts/workloads";
import type { AssetsWorkloadDeps } from "#domain/assets";
import { createAssetsWorkloadContributions } from "#domain/assets";
import type { ChatWorkloadDeps } from "#domain/chat";
import { createChatWorkloadContributions } from "#domain/chat";
import type { ConnectionWorkloadDeps } from "#domain/connection";
import { createConnectionWorkloadContributions } from "#domain/connection";
import type { DatabankWorkloadDeps } from "#domain/databank";
import { createDatabankWorkloadContributions } from "#domain/databank";
import type { DiscoveryWorkloadDeps } from "#domain/discovery";
import { createDiscoveryWorkloadContributions } from "#domain/discovery";
import type { EmbeddingsWorkloadDeps } from "#domain/embeddings";
import { createEmbeddingsWorkloadContributions } from "#domain/embeddings";
import type { ImportWorkloadDeps } from "#domain/import";
import { createImportWorkloadContributions } from "#domain/import";
import type { StatsWorkloadDeps } from "#domain/stats";
import { createStatsWorkloadContributions } from "#domain/stats";
import type { AnyWorkloadContribution, WorkloadContributions } from "#domain/workloads";
import { createReservedWorkloadContributions } from "#domain/workloads";

/** What the registry seam needs from the composition root: the union of each owning domain's contribution
 *  deps. Adding a domain's background work adds ONE member here and ONE spread below — nothing else. */
export interface WorkloadContributionsDeps
  extends EmbeddingsWorkloadDeps,
    DiscoveryWorkloadDeps,
    StatsWorkloadDeps,
    ConnectionWorkloadDeps,
    AssetsWorkloadDeps,
    ChatWorkloadDeps,
    DatabankWorkloadDeps {
  readonly importWorkloads: ImportWorkloadDeps;
}

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

/** Build the registry: every owning domain's factory, spread into one kind-keyed map. */
export function buildWorkloadContributions(deps: WorkloadContributionsDeps): WorkloadContributions {
  return keyByKind([
    ...createEmbeddingsWorkloadContributions(deps),
    ...createDiscoveryWorkloadContributions(deps),
    ...createStatsWorkloadContributions(deps),
    ...createConnectionWorkloadContributions(deps),
    ...createAssetsWorkloadContributions(deps),
    ...createChatWorkloadContributions(deps),
    ...createDatabankWorkloadContributions(deps),
    ...createImportWorkloadContributions(deps.importWorkloads),
    ...createReservedWorkloadContributions(),
  ]);
}
