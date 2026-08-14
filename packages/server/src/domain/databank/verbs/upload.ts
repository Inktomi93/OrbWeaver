// verb: upload — the sync canon write (databank-design/06 §2). Steps 1–5 are SYNCHRONOUS (the verb awaits
// them): `extractedText` is NOT NULL canon, so a failed extraction fails the upload atomically (nothing
// persisted; the content-addressed CAS blob orphans and self-heals on the next GC sweep). Steps 1–2 are the
// re-upload dedup (the `(ownerId, importHash)` unique index) — a duplicate returns the EXISTING document and
// skips ingest (its chunks already exist / are healing). The genuinely slow half — chunk+embed of N chunks =
// N provider calls — is the `databank-ingest` WORKLOAD enqueued at step 6 (build-never-blocks); the verb
// returns immediately with what became of that enqueue (`queued`, or `not-queued` when the queue refused it —
// the canon still lands, un-indexed until a reindex; `substrate/queue-ingest`).

import { documents } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { sha256Hex } from "#kit/content-hash";
import type { UploadDocumentParams } from "../contract/params.ts";
import type { UploadResult } from "../contract/results.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import { findByImportHash, toDocumentView } from "../persistence/queries.ts";
import { queueIngest } from "../substrate/queue-ingest.ts";

export function createUpload(ctx: DatabankContext): DatabankService["upload"] {
  return async ({ principal, bytes, mime, name }: UploadDocumentParams): Promise<UploadResult> => {
    const ownerId: UserId = principal.userId;
    const importHash = sha256Hex(bytes);

    const existing = await findByImportHash(ctx.db, ownerId, importHash);
    if (existing !== undefined) {
      const counts = await ctx.countChunks({ documentIds: [existing.id], model: ctx.getActiveEmbedSpace().model });
      return { document: toDocumentView(existing, counts.get(existing.id) ?? 0), outcome: "duplicate", ingest: "skipped" };
    }

    // The CAS write (content-addressed; `enforceMagic` verifies the byte signature) — kept as provenance so
    // extraction can be re-run on an extractor upgrade. Extraction is synchronous — its failure must abort the
    // upload (propagates: Unsupported/ExtractionFailed) before any documents row exists.
    const stored = await ctx.assetsStore({ principal, bytes, kind: "document", mime, enforceMagic: true });
    const extracted = await ctx.extractText(bytes, mime);
    const at = ctx.now();
    const id = ctx.newDocumentId();
    await ctx.db.insert(documents).values({
      id,
      ownerId,
      sourceAssetId: stored.assetId,
      name,
      mime,
      origin: "upload",
      sourceUrl: null,
      extractedText: extracted.text,
      importHash,
      byteSize: bytes.length,
      extractorVersion: extracted.meta.extractorVersion,
      createdAt: at,
      updatedAt: at,
    });

    const queued = await queueIngest(ctx, { documentId: id, ownerId });
    await ctx.audit({ actorUserId: ownerId, action: "databank.upload", entityType: "document", entityId: id, metadata: { name, mime, ...queued } }, at);
    // The bank announces itself (survey H3) — and this is the one producer the CLIENT could never drive from
    // a mutation, because the upload front door is a raw multipart POST with no tRPC mutation to hang an
    // `invalidates` on (it hand-called `invalidateFilters` from the add dialog). The duplicate arm above is
    // silent; it wrote nothing.
    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId: id });

    const document = toDocumentView(
      { id, name, mime, origin: "upload", sourceUrl: null, byteSize: bytes.length, charCount: extracted.text.length, createdAt: at, updatedAt: at },
      0,
    );
    return { document, outcome: "created", ingest: queued.ingest, ...(extracted.meta.charCount === 0 ? { warning: "empty-extraction" as const } : {}) };
  };
}
