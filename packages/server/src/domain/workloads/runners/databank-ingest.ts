// runner: databank-ingest — the post-upload chunk→embed→prune pass for ONE document (D49 #5;
// databank-design/06 §3). Thin wrapper: it reaches the databank ingest subsystem through the injected env
// (`ctx.env.databank.ingest`) — never a db reach or a `document_chunks` write from here (the runner tier is
// above domain-no-cross-feature; the ONE vector write path stays behind `embeddings.store`). Idempotent end
// to end (hash-gated no-ops + a bounded prune), so a crash-retry just runs it again.

import type { Runner } from "../contract/runner";

export const databankIngestRunner: Runner<"databank-ingest"> = async (ctx, params, report, signal) => {
  report({ message: `databank-ingest: chunk+embed ${params.documentId}` });
  const result = await ctx.env.databank.ingest({ documentId: params.documentId, signal });
  report({ message: `databank-ingest: ${result.chunksUpserted} written, ${result.chunksNoop} noop, ${result.chunksPruned} pruned` });
  return result;
};
