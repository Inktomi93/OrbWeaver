// runner: databank-reindex — bulk derived-layer maintenance for the databank (D49 #5; databank-design/06 §4).
// Re-runs chunk+embed(+re-extract) over one document or every document of an owner via the injected env
// (`ctx.env.databank.reindex`); the hash/prune machinery sorts out what actually changed. `ctx.ownerId` is
// the row owner — `null` = the box-wide bulk sweep (a model change is a box-level event).
//
// PD-139(c): after a BULK (`ownerId === null`), non-aborted sweep re-embeds every chunk into the box's active
// embed `(model)` space, it reclaims the rows stranded in any OTHER space via the injected embeddings purge op
// (the DELETE lives in embeddings/persistence, the ONE write path — never a raw db reach). Skipped on abort —
// the space stays a strict superset (never a gap); the rerun reclaims it. Mirrors the memory-backfill purge.

import type { Runner } from "../contract/runner";

export const databankReindexRunner: Runner<"databank-reindex"> = async (ctx, params, report, signal) => {
  const mode = params.mode ?? "chunk-embed";
  report({ message: `databank-reindex: ${mode} (${params.scope.kind} scope)` });
  const result = await ctx.env.databank.reindex({ ownerId: ctx.ownerId, scope: params.scope, mode, signal });
  report({
    message: `databank-reindex: ${result.documents} docs, ${result.chunksUpserted} written, ${result.chunksPruned} pruned, ${result.reExtracted} re-extracted`,
  });
  if (ctx.ownerId === null && !signal.aborted) {
    await ctx.env.embeddings.purgeDocumentVectors();
  }
  return result;
};
