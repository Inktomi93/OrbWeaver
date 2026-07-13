// The one home for the gallery-curation serde: both directions (build + parse) over one canonical shape.
// Pure: zero I/O, zero db, zero id-resolution — it maps a `GalleryExport` (an owner's curated
// gallery_items rows, projected id-less) to/from the orb-native .json interchange bytes. The relational
// work stays out of here, in the assets domain's gallery export/import verbs.
//
// The subject character travels as its handle, never the raw subjectCharacterId — character ids are not
// preserved across a fresh box. `assetId` is carried as-is: the assets entity restores the blob under its
// original id before gallery imports, so the id is stable and re-links with no remap.
//
// orb-native only: SillyTavern has no per-character curated-gallery concept, so there is no ST-compat
// adapter here. The envelope is the uniform {schemaKind, schemaVersion} header; parseGallery rejects a
// foreign/absent schemaKind and drops malformed rows.

import type { AssetId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

// The wire discriminant + schema version. `schemaKind` fences a gallery file from every other portable file
// (the upload router routes on it); `schemaVersion` is the lift-walk key for a future shape change.
export const GALLERY_SCHEMA_KIND = "orb.gallery";
export const GALLERY_SCHEMA_VERSION = 1;

/** One curation row as it travels in a gallery file: the curated assetId, the subject character's handle
 *  (null for an un-charactered item), and the curation timestamp. No GalleryItemId (a fresh id is minted
 *  on import), no ownerId (ownership derives through the asset FK). */
export interface CanonicalGalleryItem {
  readonly assetId: AssetId;
  readonly subjectCharacterHandle: string | null;
  readonly createdAt: number | null;
}

/** An owner's whole curated gallery as a portable set — just the gallery_items curation rows. Blobs
 *  travel via the assets entity (this carries only the curation). */
export interface GalleryExport {
  readonly items: readonly CanonicalGalleryItem[];
}

/** Serialize one canonical item with a deterministic key order (the round-trip fixed point). */
function itemToWire(item: CanonicalGalleryItem): Record<string, unknown> {
  return {
    assetId: item.assetId,
    subjectCharacterHandle: item.subjectCharacterHandle,
    createdAt: item.createdAt,
  };
}

/** Serialize a `GalleryExport` to the orb-native gallery JSON interchange bytes (the inverse of
 *  `parseGallery`). Deterministic key order makes the round-trip byte-identical. */
export function buildGallery(gallery: GalleryExport): Uint8Array {
  const wire = {
    schemaKind: GALLERY_SCHEMA_KIND,
    schemaVersion: GALLERY_SCHEMA_VERSION,
    items: gallery.items.map(itemToWire),
  };
  return new TextEncoder().encode(JSON.stringify(wire, null, 2));
}

// A lenient per-row view: assetId is required as a non-empty branded id. Deliberately not typeIdSchema
// (prefix-strict): the assetId is an opaque carried value re-linked against the db by the import verb's
// ownership gate.
const wireItemSchema = z.object({
  assetId: brandedId<AssetId>(),
  subjectCharacterHandle: z.string().trim().min(1).nullish().catch(null),
  createdAt: z.number().int().nonnegative().nullish().catch(null),
});

const wireGallerySchema = z.object({
  schemaKind: z.literal(GALLERY_SCHEMA_KIND),
  schemaVersion: z.number().int().positive(),
  items: z.array(z.unknown()),
});

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Parse orb-native gallery JSON bytes to a `GalleryExport`, or null when the bytes are not a gallery
 *  file. Resilient within a valid file: a single malformed row is dropped, never fatal. */
export function parseGallery(bytes: Uint8Array): GalleryExport | null {
  const envelope = wireGallerySchema.safeParse(decodeJson(bytes));
  if (!envelope.success) {
    return null;
  }
  const items: CanonicalGalleryItem[] = [];
  for (const raw of envelope.data.items) {
    const row = wireItemSchema.safeParse(raw);
    if (!row.success) {
      continue;
    }
    const item = row.data;
    items.push({
      assetId: item.assetId,
      subjectCharacterHandle: item.subjectCharacterHandle ?? null,
      createdAt: item.createdAt ?? null,
    });
  }
  return { items };
}
