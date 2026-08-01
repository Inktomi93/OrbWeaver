// domain/databank — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). Two kinds: the document-RAG derived layer.
//
// This domain was already the MODEL for the whole migration: its ENQUEUE side has always been an injected op
// at databank's own door (`enqueueIngest`, so `upload` never blocks on the build). Only the RUN side was
// still spelled inside workloads; it is here now, and the two halves finally live together.

import type { IngestRunResult } from "@orb/contracts/databank";
import { databankIngestWorkloadParams, databankReindexWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { DatabankWorkloadDeps } from "./contract/service";

type DatabankContributions = readonly [WorkloadContribution<"databank-ingest">, WorkloadContribution<"databank-reindex">];

/** The mode a reindex runs when the row didn't pick one — the domain's own floor. */
const DEFAULT_REINDEX_MODE = "chunk-embed";

export function createDatabankWorkloadContributions(deps: DatabankWorkloadDeps): DatabankContributions {
  return [
    {
      kind: "databank-ingest",
      params: databankIngestWorkloadParams,
      // A user is WAITING on this: they uploaded a document and RAG is unavailable until it lands. This is
      // the interactive lane's reason to exist — a 20-minute import must never head-block it.
      lane: "interactive",
      // Hash-gated no-ops + a bounded prune make it idempotent end to end; a crash-retry just runs it again.
      resume: "idempotent-restart",
      run: async (_ctx, params, report, signal): Promise<IngestRunResult> => {
        report({ message: `databank-ingest: chunk+embed ${params.documentId}` });
        const result = await deps.databankIngest.ingestDocument({ documentId: params.documentId, signal });
        report({ message: `databank-ingest: ${result.chunksUpserted} written, ${result.chunksNoop} noop, ${result.chunksPruned} pruned` });
        return result;
      },
    },
    {
      kind: "databank-reindex",
      params: databankReindexWorkloadParams,
      // Bulk derived-layer maintenance over one document or a whole owner — a sweep, not a user's wait.
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (ctx, params, report, signal): Promise<IngestRunResult> => {
        const mode = params.mode ?? DEFAULT_REINDEX_MODE;
        report({ message: `databank-reindex: ${mode} (${params.scope.kind} scope)` });
        const result = await deps.databankIngest.reindex({ ownerId: ctx.ownerId, scope: params.scope, mode, signal });
        report({
          message: `databank-reindex: ${result.documents} docs, ${result.chunksUpserted} written, ${result.chunksPruned} pruned, ${result.reExtracted} re-extracted`,
        });
        // PD-139(c): once a BULK (all-owners), non-aborted sweep has re-embedded every chunk into the box's
        // active embed `(model)` space, reclaim the rows stranded in any OTHER space. The DELETE lives in
        // embeddings/persistence (the ONE vector write path) — this is the injected op, never a db reach.
        // Skipped on abort: the space stays a strict superset (never a gap); the rerun reclaims it.
        if (ctx.ownerId === null && !signal.aborted) {
          await deps.purgeDocumentVectors();
        }
        return result;
      },
    },
  ];
}
