// verb: createFromText — origin 'text' (ST Notepad): no bytes, no extraction; the passed `text` IS the canon
// (databank-design/06 §2). `sourceAssetId` is NULL (nothing to re-extract from — its `extractedText` is the
// only source, which is fine), `extractorVersion` is "none" (excluded from re-extract sweeps), `importHash`
// is the sha-256 of the UTF-8 text (same `(ownerId, importHash)` re-paste dedup semantics as a re-upload).
// Then the SAME step 5–7 as upload: documents row → enqueue `databank-ingest` → report the ingest outcome
// (`queued`, or `not-queued` when the queue refused the build — the canon still lands; `substrate/queue-ingest`).

import { documents } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { sha256Hex } from "#kit/content-hash";
import type { CreateFromTextParams } from "../contract/params.ts";
import type { UploadResult } from "../contract/results.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import { findByImportHash, toDocumentView } from "../persistence/queries.ts";
import { queueIngest } from "../substrate/queue-ingest.ts";

const TEXT_MIME = "text/plain";
const NO_EXTRACTOR = "none";

export function createCreateFromText(ctx: DatabankContext): DatabankService["createFromText"] {
  return async ({ principal, name, text }: CreateFromTextParams): Promise<UploadResult> => {
    const ownerId: UserId = principal.userId;
    const importHash = sha256Hex(text);

    const existing = await findByImportHash(ctx.db, ownerId, importHash);
    if (existing !== undefined) {
      const counts = await ctx.countChunks({ documentIds: [existing.id], model: ctx.getActiveEmbedSpace().model });
      return { document: toDocumentView(existing, counts.get(existing.id) ?? 0), outcome: "duplicate", ingest: "skipped" };
    }

    const at = ctx.now();
    const id = ctx.newDocumentId();
    const byteSize = new TextEncoder().encode(text).length;
    await ctx.db.insert(documents).values({
      id,
      ownerId,
      sourceAssetId: null,
      name,
      mime: TEXT_MIME,
      origin: "text",
      sourceUrl: null,
      extractedText: text,
      importHash,
      byteSize,
      extractorVersion: NO_EXTRACTOR,
      createdAt: at,
      updatedAt: at,
    });

    const queued = await queueIngest(ctx, { documentId: id, ownerId });
    await ctx.audit({ actorUserId: ownerId, action: "databank.createFromText", entityType: "document", entityId: id, metadata: { name, ...queued } }, at);

    const document = toDocumentView(
      { id, name, mime: TEXT_MIME, origin: "text", sourceUrl: null, byteSize, charCount: text.length, createdAt: at, updatedAt: at },
      0,
    );
    return { document, outcome: "created", ingest: queued.ingest };
  };
}
