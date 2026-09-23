// domain/databank — the domain's OWN background work, raised as `WorkloadContribution`s (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). Two kinds: the document-RAG derived layer.
//
// This domain was already the MODEL for the whole migration: its ENQUEUE side has always been an injected op
// at databank's own door (`enqueueIngest`, so `upload` never blocks on the build). Only the RUN side was
// still spelled inside workloads; it is here now, and the two halves finally live together.

import type { IngestRunResult } from "@orb/contracts/databank";
import { databankIngestWorkloadParams, databankReindexWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { DatabankWorkloadDeps } from "./contract/service.ts";

type DatabankContributions = readonly [WorkloadContribution<"databank-ingest">, WorkloadContribution<"databank-reindex">];

/** The mode a reindex runs when the row didn't pick one — the domain's own floor. */
const DEFAULT_REINDEX_MODE = "chunk-embed";

export function createDatabankWorkloadContributions(deps: DatabankWorkloadDeps): DatabankContributions {
  return [
    {
      kind: "databank-ingest",
      params: databankIngestWorkloadParams,
      // THE CONCURRENCY UNIT IS THE DOCUMENT. Seeding a bank means adding document after document, and each
      // one is independent work — before this key existed the singular lock was per-(kind, owner), so the
      // SECOND document was refused with a CONFLICT while the first ingested and its already-written
      // `documents` row was left with no workload at all (parked at `Queued` forever). Keying on the document
      // keeps the guard that matters — one document cannot be ingested twice at once — and drops the one
      // that never made sense.
      admissionKey: (params) => params.documentId,
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
      // Same unit rule as ingest, one level up: a per-document repair (the library row's Reindex) is its own
      // unit, so healing two wedged documents does not serialize; the owner-wide sweep is a single unit
      // (`owner`) and stays single-active against itself. The reindex MODE is deliberately NOT in the key —
      // a `chunk-embed` and a `re-extract` pass over the same document must not race each other.
      admissionKey: (params) => (params.scope.kind === "document" ? params.scope.documentId : params.scope.kind),
      // Bulk derived-layer maintenance over one document or a whole owner — a sweep, not a user's wait.
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (ctx, params, report, signal): Promise<IngestRunResult> => {
        // Only an OWNER-WIDE pass re-derives a whole `documents` scope, so only it may claim one (#2517) —
        // a single-document repair covers one row and says nothing about the rest of the corpus.
        const corpusWide = params.scope.kind === "owner";
        const generationReceipts = corpusWide ? await deps.beginDocumentVectorSweep(ctx.ownerId) : [];
        const mode = params.mode ?? DEFAULT_REINDEX_MODE;
        report({ message: `databank-reindex: ${mode} (${params.scope.kind} scope)` });
        const result = await deps.databankIngest.reindex({ ownerId: ctx.ownerId, scope: params.scope, mode, signal });
        report({
          message: `databank-reindex: ${result.documents} docs, ${result.chunksUpserted} written, ${result.chunksPruned} pruned, ${result.reExtracted} re-extracted`,
        });
        // THE PASS'S TERMINAL — record the `documents` scope's completion for the generations this pass
        // opened, and reclaim the chunks stranded in any OTHER embed space once cards, memory and
        // documents all name the same target generation. The DELETE lives in embeddings/persistence (the ONE
        // vector write path) — this is the injected op, never a db reach.
        //
        // #2517 — THE RULING SURVIVES, ITS INPUT CHANGED, exactly as in chat's memory sweep: the BULK-ONLY
        // fence was an argument about the cross-owner FAN-OUT, and it had the COMPLETION welded to it, so an
        // owner's own reindex could never make `readGeneration` say `ready`. The fan-out now lives inside
        // `beginDocumentVectorSweep`, which enumerates the scope it is handed. Still skipped on abort: the
        // space stays a strict superset (never a gap); the rerun reclaims it.
        //
        // WHAT DID *NOT* CHANGE: the reclaim's blast radius. `markGenerationComplete` promotes nothing until
        // cards, memory AND documents name the same `(generation, epoch)`, and its DELETEs derive their row
        // set from THIS owner's documents (`embeddings/persistence/space-state.ts retiredVectorStatements`),
        // so a per-owner pass can only ever reclaim its own old space. The cross-owner reach lives solely in
        // the op's fan-out, which the enumeration scope still decides.
        if (corpusWide && !signal.aborted) {
          await deps.purgeDocumentVectors(generationReceipts);
        }
        return result;
      },
    },
  ];
}
