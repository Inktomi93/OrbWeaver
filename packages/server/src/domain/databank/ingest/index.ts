// domain/databank/ingest — the chunk→embed→prune orchestration, the embeddings
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
//
// EACH PASS ANNOUNCES ITSELF ONCE, AT ITS TERMINAL (event-bus coverage survey H3/§2.5, the #23 import-terminal
// shape): one `databankChanged` per owner whose documents this pass actually touched — see `announceIngest`.
// This is the half no mutation could ever drive: the writer is a WORKLOAD, so not even the tab that hit
// Reindex has an `invalidates` to hang on, and what moves is the `chunkCount`/`embeddedCount` every library
// row projects.
//
// THE CLIENT'S MID-INGEST POLL STAYS, and it is NOT redundant with this event (owner ruling 2026-08-14 —
// written down here because "the bus covers it now" is the predictable future misread). The library's
// bounded `refetchInterval` while a row is ingesting is the only driver of PROGRESS: the chunk counts tick
// continuously between enqueue and terminal, and nothing emits per chunk — correctly, since a per-chunk fan
// is a corpus-sized storm. This terminal event announces the FINAL state; the poll shows the work happening.
// Two facts, two drivers; deleting the poll would silently freeze the counts mid-run.

import type { IngestRunResult, ReindexMode, ReindexScope } from "@orb/contracts/databank";
import { documents } from "@orb/db";
import { chunkText } from "@orb/kit/chunk";
import type { DocumentId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { DatabankNoEmbedSpaceError } from "../contract/errors.ts";
import type { DatabankContext, DatabankIngest } from "../contract/service.ts";
import { listAllDocumentIds, listOwnedDocumentIds, loadDocument } from "../persistence/queries.ts";

/** The loaded canon row — derived from the query's return (the db row type's home is `@orb/db`, never
 *  re-declared here). */
type LoadedDocument = NonNullable<Awaited<ReturnType<typeof loadDocument>>>;

interface DocCounts {
  readonly chunksUpserted: number;
  readonly chunksNoop: number;
  readonly chunksPruned: number;
}

interface RunDocumentArgs {
  readonly documentId: DocumentId;
  readonly mode: ReindexMode;
  readonly signal: AbortSignal;
  readonly acc: IngestAccumulator;
  readonly touchedOwners: Set<UserId>;
}

// Read through a call boundary so TypeScript does not freeze `AbortSignal.aborted` at its pre-await value.
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** Accumulate per-document counts into the run-level result. */
class IngestAccumulator {
  private documents = 0;
  private chunksUpserted = 0;
  private chunksNoop = 0;
  private chunksPruned = 0;
  private reExtracted = 0;
  private readonly failed: { documentId: DocumentId; error: string }[] = [];

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
  addFailure(documentId: DocumentId, error: unknown): void {
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
async function ingestOne(ctx: DatabankContext, doc: LoadedDocument, signal: AbortSignal): Promise<DocCounts> {
  const settings = await ctx.getDatabankSettings(doc.ownerId);
  const space = await ctx.getActiveEmbedSpace(doc.ownerId);
  if (space === null) {
    throw new DatabankNoEmbedSpaceError();
  }
  const chunks = chunkText(doc.extractedText, settings.chunk);
  let chunksUpserted = 0;
  let chunksNoop = 0;
  for (const chunk of chunks) {
    if (isAborted(signal)) {
      return { chunksUpserted, chunksNoop, chunksPruned: 0 };
    }
    const stored = await ctx.embeddingsStore({
      kind: "document",
      lens: "chunk",
      ownerId: doc.ownerId,
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
  if (isAborted(signal)) {
    return { chunksUpserted, chunksNoop, chunksPruned: 0 };
  }
  const { rowsDeleted } = await ctx.pruneDocumentChunks({ documentId: doc.id, keepCount: chunks.length, model: space.model });
  return { chunksUpserted, chunksNoop, chunksPruned: rowsDeleted };
}

/** Re-derive `extractedText` from the CAS bytes when the document was extracted by an OLDER extractor (the
 *  mode:'re-extract' predicate). A purged blob or a bytesless origin ('text') is skipped (nothing better to
 *  extract from). Returns the refreshed row when it re-extracted, else the original. */
// @orb-waive owner-scoped-writes(documents): the ingest plane's own row — `doc` came from `loadDocument`, which carries the twin read marker: reindex runs AFTER the enqueue authority check (the workload row's owner is the gate) over ids the enqueue itself resolved. The write refreshes derived extraction text, never user-authored content. Ends the day ingest takes a documentId straight off a request.
async function maybeReExtract(ctx: DatabankContext, doc: LoadedDocument, acc: IngestAccumulator, signal: AbortSignal): Promise<LoadedDocument> {
  if (isAborted(signal) || doc.sourceAssetId === null || doc.extractorVersion === ctx.extractorVersion) {
    return doc;
  }
  const bytes = await ctx.loadAssetBytes(doc.sourceAssetId);
  if (isAborted(signal) || bytes === undefined) {
    return doc;
  }
  const extracted = await ctx.extractText(bytes, doc.mime);
  if (isAborted(signal)) {
    return doc;
  }
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

/**
 * THE TERMINAL FAN (survey H3, the #23 import-terminal shape): ONE `databankChanged` per owner whose
 * documents this pass touched, at the END of the pass — never per document (that is a storm over a
 * bank-sized loop) and never per chunk.
 *
 * PER OWNER, not per pass: the box-wide bulk arm (`ownerId: null`) reindexes across owners, and a user-bus
 * event reaches exactly one user's channel — a single fan would leave every other owner frozen. The audience
 * is the owners the pass actually LOADED a document for, so an owner with nothing in scope gets nothing,
 * which is the truth. No `documentId` hint: a pass touches many, and naming one would be a lie the client's
 * root path-invalidate does not need anyway.
 */
function announceIngest(ctx: DatabankContext, touchedOwners: ReadonlySet<UserId>): void {
  for (const owner of touchedOwners) {
    ctx.emitUserEvent(owner, { type: "databankChanged" });
  }
}

export function createDatabankIngest(ctx: DatabankContext): DatabankIngest {
  const runDocument = async ({ documentId, mode, signal, acc, touchedOwners }: RunDocumentArgs): Promise<void> => {
    if (isAborted(signal)) {
      return;
    }
    const doc = await loadDocument(ctx.db, documentId);
    if (isAborted(signal) || doc === undefined) {
      // A document deleted between enqueue and dispatch — no work, no failure (its chunks CASCADEd away).
      return;
    }
    acc.addDocument();
    touchedOwners.add(doc.ownerId);
    // @orb-waive caught-failure-ownership(error): bookkeeping — the accumulator records this document's failure (`acc.addFailure`), surfaced to the caller via `acc.result()`; the pass continues so one bad document never aborts the batch. Ends if `addFailure` stops being read by the returned result.
    try {
      const source = mode === "re-extract" ? await maybeReExtract(ctx, doc, acc, signal) : doc;
      if (!isAborted(signal)) {
        acc.addCounts(await ingestOne(ctx, source, signal));
      }
    } catch (error) {
      acc.addFailure(documentId, error);
    }
  };

  return {
    ingestDocument: async ({ documentId, signal }): Promise<IngestRunResult> => {
      const acc = new IngestAccumulator();
      const touchedOwners = new Set<UserId>();
      try {
        await runDocument({ documentId, mode: "chunk-embed", signal, acc, touchedOwners });
        return acc.result();
      } finally {
        announceIngest(ctx, touchedOwners);
      }
    },
    reindex: async ({ ownerId, scope, mode, signal }): Promise<IngestRunResult> => {
      const acc = new IngestAccumulator();
      // Accumulated as the documents land and announced from a `finally`, so a CANCELLED sweep still tells
      // the owners whose documents it already re-embedded (an abort mid-pass would otherwise leave half-new
      // chunk counts on every device until something unrelated moved).
      const touchedOwners = new Set<UserId>();
      try {
        const ids = await resolveReindexIds(ctx, ownerId, scope);
        for (const id of ids) {
          if (isAborted(signal)) {
            break;
          }
          await runDocument({ documentId: id, mode, signal, acc, touchedOwners });
        }
        return acc.result();
      } finally {
        announceIngest(ctx, touchedOwners);
      }
    },
  };
}
