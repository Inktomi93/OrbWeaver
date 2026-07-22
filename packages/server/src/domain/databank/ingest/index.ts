// domain/databank/ingest — the chunk→embed→prune orchestration (databank-design/06 §3), the embeddings
// indexer analogue. Called by the databank-ingest/reindex runners through the injected workload env;
// idempotent end to end. The ONE core `ingestOne` both kinds share: load canon → chunk (pure @orb/kit/chunk)
// → store each chunk via the injected `embeddingsStore` (the ONE vector write path — a matched content_hash
// is a free 'noop') → prune the strays (shrunk tail + retired space) via the injected `pruneDocumentChunks`.
// databank NEVER inserts a `document_chunks` row itself (single-write-path invariant).
//
// Idempotency: `contentHash` no-ops dedup the vector layer, the prune bounds the set — running `ingestOne`
// twice is byte-identical state + zero extra provider calls, which makes crash recovery "just run it again".
// Partial failure is DATA (`failed[]`), not a throw: a chunk embed failing mid-run leaves the earlier chunks
// written (retrieval over them is safe — missing chunks simply aren't hits yet) and one bad document must
// never fail an owner-wide reindex.

import type { IngestRunResult, ReindexMode, ReindexScope } from "@orb/contracts/databank";
import { documents } from "@orb/db";
import { chunkText } from "@orb/kit/chunk";
import type { DocumentId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { DatabankContext, DatabankIngest } from "../contract/service";
import { listAllDocumentIds, listOwnedDocumentIds, loadDocument } from "../persistence/queries";

/** The loaded canon row — derived from the query's return (the db row type's home is `@orb/db`, never
 *  re-declared here). */
type LoadedDocument = NonNullable<Awaited<ReturnType<typeof loadDocument>>>;

interface DocCounts {
  readonly chunksUpserted: number;
  readonly chunksNoop: number;
  readonly chunksPruned: number;
}

/** Accumulate per-document counts into the run-level result. */
class IngestAccumulator {
  private documents = 0;
  private chunksUpserted = 0;
  private chunksNoop = 0;
  private chunksPruned = 0;
  private reExtracted = 0;
  private readonly failed: { documentId: string; error: string }[] = [];

  addDocument(): void {
    this.documents += 1;
  }
  addCounts(counts: DocCounts): void {
    this.chunksUpserted += counts.chunksUpserted;
    this.chunksNoop += counts.chunksNoop;
    this.chunksPruned += counts.chunksPruned;
  }
  addReExtracted(): void {
    this.reExtracted += 1;
  }
  addFailure(documentId: string, error: unknown): void {
    this.failed.push({ documentId, error: error instanceof Error ? error.message : String(error) });
  }
  result(): IngestRunResult {
    return {
      documents: this.documents,
      chunksUpserted: this.chunksUpserted,
      chunksNoop: this.chunksNoop,
      chunksPruned: this.chunksPruned,
      reExtracted: this.reExtracted,
      failed: this.failed,
    };
  }
}

/** Chunk + embed + prune ONE document's derived layer. Throws only on a genuinely failed embed (the caller
 *  records it as data); returns the per-document counts on success. */
async function ingestOne(ctx: DatabankContext, doc: LoadedDocument): Promise<DocCounts> {
  const settings = await ctx.getDatabankSettings(doc.ownerId);
  const space = ctx.getActiveEmbedSpace();
  const chunks = chunkText(doc.extractedText, settings.chunk);
  let chunksUpserted = 0;
  let chunksNoop = 0;
  for (const chunk of chunks) {
    // biome-ignore lint/performance/noAwaitInLoops: chunk embeds are ordered + provider-serialized (one embed call per chunk); a parallel fan-out would only race the provider's own queue. Idempotent, so a mid-run failure is resumable.
    const stored = await ctx.embeddingsStore({
      kind: "document",
      lens: "chunk",
      content: chunk.content,
      model: space.model,
      dim: space.dim,
      fkRefs: { documentId: doc.id, chunkIdx: chunk.idx, charStart: chunk.start, charEnd: chunk.end },
    });
    if (stored.outcome === "noop") {
      chunksNoop += 1;
    } else {
      chunksUpserted += 1;
    }
  }
  const { rowsDeleted } = await ctx.pruneDocumentChunks({ documentId: doc.id, keepCount: chunks.length, model: space.model });
  return { chunksUpserted, chunksNoop, chunksPruned: rowsDeleted };
}

/** Re-derive `extractedText` from the CAS bytes when the document was extracted by an OLDER extractor (the
 *  mode:'re-extract' predicate). A purged blob or a bytesless origin ('text') is skipped (nothing better to
 *  extract from). Returns the refreshed row when it re-extracted, else the original. */
async function maybeReExtract(ctx: DatabankContext, doc: LoadedDocument, acc: IngestAccumulator): Promise<LoadedDocument> {
  if (doc.sourceAssetId === null || doc.extractorVersion === ctx.extractorVersion) {
    return doc;
  }
  const bytes = await ctx.loadAssetBytes(doc.sourceAssetId);
  if (bytes === undefined) {
    return doc;
  }
  const extracted = await ctx.extractText(bytes, doc.mime);
  const at = ctx.now();
  await ctx.db
    .update(documents)
    .set({ extractedText: extracted.text, extractorVersion: extracted.meta.extractorVersion, updatedAt: at })
    .where(eq(documents.id, doc.id));
  acc.addReExtracted();
  return { ...doc, extractedText: extracted.text, extractorVersion: extracted.meta.extractorVersion, updatedAt: at };
}

/** Resolve the document id set a reindex covers. `document` scope → the one id (owner-checked when scoped);
 *  `owner` scope → every id of the owner, or box-wide for the null-owner bulk sweep. */
async function resolveReindexIds(ctx: DatabankContext, ownerId: UserId | null, scope: ReindexScope): Promise<DocumentId[]> {
  if (scope.kind === "document") {
    return [scope.documentId];
  }
  return await (ownerId === null ? listAllDocumentIds(ctx.db) : listOwnedDocumentIds(ctx.db, ownerId));
}

export function createDatabankIngest(ctx: DatabankContext): DatabankIngest {
  const runDocument = async (documentId: DocumentId, mode: ReindexMode, acc: IngestAccumulator): Promise<void> => {
    const doc = await loadDocument(ctx.db, documentId);
    if (doc === undefined) {
      // A document deleted between enqueue and dispatch — no work, no failure (its chunks CASCADEd away).
      return;
    }
    acc.addDocument();
    try {
      const source = mode === "re-extract" ? await maybeReExtract(ctx, doc, acc) : doc;
      acc.addCounts(await ingestOne(ctx, source));
    } catch (error) {
      acc.addFailure(documentId, error);
    }
  };

  return {
    ingestDocument: async ({ documentId }): Promise<IngestRunResult> => {
      const acc = new IngestAccumulator();
      await runDocument(documentId, "chunk-embed", acc);
      return acc.result();
    },
    reindex: async ({ ownerId, scope, mode, signal }): Promise<IngestRunResult> => {
      const acc = new IngestAccumulator();
      const ids = await resolveReindexIds(ctx, ownerId, scope);
      for (const id of ids) {
        if (signal.aborted) {
          break;
        }
        // biome-ignore lint/performance/noAwaitInLoops: documents reindex sequentially — one bad document must not fail the sweep, and the shared embed provider is serialized anyway. Cooperative abort between documents.
        await runDocument(id, mode, acc);
      }
      return acc.result();
    },
  };
}
