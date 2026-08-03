// domain/databank/persistence/portability-write — the three portability factories (contract/portability.ts).
// Standalone factories (db + clock + id minter + the ingest enqueue only) so the bundle path can be wired at
// compose without dragging the Principal-scoped service (the regex portability-write precedent).
//
// The two cross-domain reads (an owned `assets` row for the source-blob re-link, an owned `characters` row
// for the handle re-link) live HERE because `persistence/` is the sanctioned home for a cross-domain
// ownership check — both are owner-gated, so a carried assetId/handle can never launder a foreign row onto
// this document.

import { assets, characterDocuments, characters, documents, globalDocuments } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { AssetId, CharacterId, DocumentId, UserId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { and, eq, inArray } from "drizzle-orm";
import type { CanonicalDocument } from "#kit/serde/databank";
import { buildDocumentFile, DATABANK_SCHEMA_KIND, parseDocumentFile } from "#kit/serde/databank";
import { portableParseError } from "#kit/serde/lib";
import type {
  DatabankImportOutcome,
  DatabankPortabilityContext,
  ExportDocument,
  ExportedDocumentFile,
  ImportDocument,
  ListOwnedDocumentIds,
} from "../contract/portability";
import { findByImportHash, loadOwnedDocument } from "./queries";

const LIMIT_ONE = 1;

/** The owner's whole document set, id-only (no canon read — the stream pulls one body at a time). */
export function createListOwnedDocumentIds(ctx: Pick<DatabankPortabilityContext, "db">): ListOwnedDocumentIds {
  return async ({ ownerId }): Promise<readonly DocumentId[]> => {
    const rows = await ctx.db.select({ id: documents.id }).from(documents).where(eq(documents.ownerId, ownerId));
    return rows.map((r) => r.id);
  };
}

/** The handles of the owner's characters this document is attached to. Owner-scoped through the join (never
 *  a bare junction scan). */
async function attachedHandles(ctx: Pick<DatabankPortabilityContext, "db">, ownerId: UserId, documentId: DocumentId): Promise<readonly string[]> {
  const rows = await ctx.db
    .select({ handle: characters.handle })
    .from(characterDocuments)
    .innerJoin(characters, eq(characters.id, characterDocuments.characterId))
    .where(and(eq(characterDocuments.documentId, documentId), eq(characters.ownerId, ownerId)));
  return rows.map((r) => r.handle);
}

export function createExportDocument(ctx: Pick<DatabankPortabilityContext, "db">): ExportDocument {
  return async ({ ownerId, documentId }): Promise<ExportedDocumentFile | null> => {
    const row = await loadOwnedDocument(ctx.db, ownerId, documentId);
    if (row === undefined) {
      return null;
    }
    const globalRows = await ctx.db
      .select({ documentId: globalDocuments.documentId })
      .from(globalDocuments)
      .where(and(eq(globalDocuments.documentId, documentId), eq(globalDocuments.ownerId, ownerId)))
      .limit(LIMIT_ONE);
    const doc: CanonicalDocument = {
      name: row.name,
      mime: row.mime,
      origin: row.origin,
      sourceUrl: row.sourceUrl,
      extractedText: row.extractedText,
      importHash: row.importHash,
      byteSize: row.byteSize,
      extractorVersion: row.extractorVersion,
      createdAt: row.createdAt,
      sourceAssetId: row.sourceAssetId,
      global: globalRows.length > 0,
      characterHandles: await attachedHandles(ctx, ownerId, documentId),
    };
    // The id keeps the leaf unique (same-named documents can't collide).
    return { filename: `${slugifyHandle(row.name)}-${documentId}.json`, bytes: buildDocumentFile(doc) };
  };
}

/** The carried source blob, re-linked only when the owner actually holds it on THIS box (the assets entity
 *  restores blobs under their original ids and imports first). Absent/foreign ⇒ null — the column's own
 *  SET NULL semantics: a purged blob degrades a document, never blocks it. */
async function resolveSourceAsset(ctx: Pick<DatabankPortabilityContext, "db">, ownerId: UserId, assetId: AssetId | null): Promise<AssetId | null> {
  if (assetId === null) {
    return null;
  }
  const rows = await ctx.db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0]?.id ?? null;
}

/** The carried handles, resolved to the IMPORTER's own character ids. An unresolved handle is simply not
 *  attached (the gallery precedent) — never an error, never a foreign row. */
async function resolveCharacters(ctx: Pick<DatabankPortabilityContext, "db">, ownerId: UserId, handles: readonly string[]): Promise<readonly CharacterId[]> {
  if (handles.length === 0) {
    return [];
  }
  const rows = await ctx.db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), inArray(characters.handle, [...handles])));
  return rows.map((r) => r.id);
}

/** The attachment writes shared by the fresh-insert and the dedup paths — idempotent both times. */
async function attachmentStatements(
  ctx: Pick<DatabankPortabilityContext, "db">,
  ownerId: UserId,
  documentId: DocumentId,
  doc: CanonicalDocument,
): Promise<BatchStmt[]> {
  const stmts: BatchStmt[] = [];
  if (doc.global) {
    stmts.push(ctx.db.insert(globalDocuments).values({ ownerId, documentId }).onConflictDoNothing());
  }
  for (const characterId of await resolveCharacters(ctx, ownerId, doc.characterHandles)) {
    stmts.push(ctx.db.insert(characterDocuments).values({ characterId, documentId }).onConflictDoNothing());
  }
  return stmts;
}

export function createImportDocument(ctx: DatabankPortabilityContext): ImportDocument {
  return async ({ ownerId, bytes }): Promise<DatabankImportOutcome> => {
    const parsed = parseDocumentFile(bytes);
    if (!parsed.ok) {
      return { ok: false, error: portableParseError(DATABANK_SCHEMA_KIND, parsed.reason) };
    }
    const doc = parsed.value;
    const at = ctx.now();

    // The `(ownerId, importHash)` re-upload dedup, reused verbatim: a re-imported bundle re-asserts the
    // document's scopes and writes no second copy of the canon.
    const existing = await findByImportHash(ctx.db, ownerId, doc.importHash);
    if (existing !== undefined) {
      const stmts = await attachmentStatements(ctx, ownerId, existing.id, doc);
      if (stmts.length > 0) {
        await ctx.db.batch(batchMany(stmts));
      }
      return { ok: true, created: false };
    }

    const documentId = ctx.newDocumentId();
    const sourceAssetId = await resolveSourceAsset(ctx, ownerId, doc.sourceAssetId);
    const stmts: BatchStmt[] = [
      ctx.db.insert(documents).values({
        id: documentId,
        ownerId,
        sourceAssetId,
        name: doc.name,
        mime: doc.mime,
        origin: doc.origin,
        sourceUrl: doc.sourceUrl,
        extractedText: doc.extractedText,
        importHash: doc.importHash,
        byteSize: doc.byteSize,
        extractorVersion: doc.extractorVersion,
        createdAt: doc.createdAt ?? at,
        updatedAt: at,
      }),
      ...(await attachmentStatements(ctx, ownerId, documentId, doc)),
    ];
    await ctx.db.batch(batchMany(stmts));

    // Nothing DERIVED travels: without this the restored document is invisible to retrieval.
    await ctx.enqueueIngest({ documentId, ownerId });
    return { ok: true, created: true };
  };
}
