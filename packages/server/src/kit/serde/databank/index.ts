// The one orb-native databank-document serde core: both directions in one home, so build + parse can never
// drift. Pure: zero I/O, zero db, zero id-resolution — it maps a `CanonicalDocument` (one `documents` row,
// id-less and owner-less, plus the two attachments that can be re-linked on a fresh box) to/from the
// portable `databank/*.json` bytes.
//
// ONE FILE PER DOCUMENT, not one file per library: `extractedText` IS the canon (schema/databank.ts) and a
// single document can be megabytes, so the descriptor streams one document at a time (the world-info book
// / regex script precedent) and a corrupt document costs exactly itself.
//
// WHAT TRAVELS AND WHY:
//   • `importHash` rides as-is — it is the `(ownerId, importHash)` re-upload dedup key, so carrying it is
//     what makes a re-import idempotent instead of duplicating the library.
//   • `sourceAssetId` rides — the assets entity restores blobs under their ORIGINAL ids and imports FIRST,
//     so the re-extract source re-links with no remap. An absent/foreign asset degrades to null (the
//     column's own SET NULL semantics — a purged blob degrades a doc, never blocks it).
//   • `global` rides (it is a property of this owner's own bank) and `characterHandles` ride by HANDLE (the
//     gallery precedent — character ids are not preserved; databank imports AFTER character).
//   • the chat junction does NOT ride: chat ids are not preserved and chats import last (accepted-lossy).
//   • nothing DERIVED travels: chunks/embeddings are re-run by the ingest the import verb enqueues.
//
// Round-trip drift guard: buildDocumentFile(parseDocumentFile(buildDocumentFile(d))) deep-equals
// buildDocumentFile(d).

import type { DocOrigin } from "@orb/contracts/databank";
import { docOriginSchema } from "@orb/contracts/databank";
import type { PortableParse } from "@orb/contracts/portability";
import type { AssetId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { defineJsonObjectSerde } from "#kit/serde/lib";

export const DATABANK_SCHEMA_KIND = "orb.databank.document";
export const DATABANK_SCHEMA_VERSION = 1;

/** One databank document as it travels: the canon + its provenance, plus the two re-linkable scopes. No
 *  DocumentId (a fresh id is minted on import), no ownerId (stamped at write time). */
export interface CanonicalDocument {
  readonly name: string;
  readonly mime: string;
  readonly origin: DocOrigin;
  readonly sourceUrl: string | null;
  /** THE CANON (binary → text). */
  readonly extractedText: string;
  /** sha-256 of the SOURCE bytes — the `(ownerId, importHash)` dedup key that makes re-import idempotent. */
  readonly importHash: string;
  readonly byteSize: number;
  readonly extractorVersion: string;
  readonly createdAt: number | null;
  /** The original CAS blob, re-linked when the assets entity restored it (null otherwise). */
  readonly sourceAssetId: AssetId | null;
  /** Attached to the owner's personal (global) bank. */
  readonly global: boolean;
  /** Characters this document is attached to, by handle (ids are not preserved across a box). */
  readonly characterHandles: readonly string[];
}

const wireDocumentSchema = z.object({
  name: z.string().trim().min(1),
  mime: z.string(),
  origin: docOriginSchema,
  sourceUrl: z.string().nullish().catch(null),
  extractedText: z.string(),
  importHash: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  extractorVersion: z.string(),
  createdAt: z.number().int().nonnegative().nullish().catch(null),
  // Deliberately not typeIdSchema (prefix-strict): an opaque carried value the import verb re-links against
  // the db behind its own ownership gate (the gallery `assetId` precedent).
  sourceAssetId: brandedId<AssetId>().nullish().catch(null),
  global: z.boolean().catch(false),
  characterHandles: z.array(z.string().trim().min(1)).catch([]),
});

const documentSerde = defineJsonObjectSerde<CanonicalDocument, z.infer<typeof wireDocumentSchema>>({
  schemaKind: DATABANK_SCHEMA_KIND,
  schemaVersion: DATABANK_SCHEMA_VERSION,
  bodySchema: wireDocumentSchema,
  toWire: (doc) => ({
    name: doc.name,
    mime: doc.mime,
    origin: doc.origin,
    sourceUrl: doc.sourceUrl,
    extractedText: doc.extractedText,
    importHash: doc.importHash,
    byteSize: doc.byteSize,
    extractorVersion: doc.extractorVersion,
    createdAt: doc.createdAt,
    sourceAssetId: doc.sourceAssetId,
    global: doc.global,
    characterHandles: [...doc.characterHandles],
  }),
  fromWire: (body) => ({
    name: body.name,
    mime: body.mime,
    origin: body.origin,
    sourceUrl: body.sourceUrl ?? null,
    extractedText: body.extractedText,
    importHash: body.importHash,
    byteSize: body.byteSize,
    extractorVersion: body.extractorVersion,
    createdAt: body.createdAt ?? null,
    sourceAssetId: body.sourceAssetId ?? null,
    global: body.global,
    characterHandles: body.characterHandles,
  }),
});

/** Serialize one canonical document to the portable `databank/*.json` bytes (the inverse of
 *  `parseDocumentFile`). Deterministic key order makes the round-trip byte-identical. */
export function buildDocumentFile(doc: CanonicalDocument): Uint8Array {
  return documentSerde.build(doc);
}

/** Parse untrusted databank-document bytes, or the typed reason they were refused. */
export function parseDocumentFile(bytes: Uint8Array): PortableParse<CanonicalDocument> {
  return documentSerde.parse(bytes);
}
