// @orb/server/kit/serde/gallery — the ONE home for the gallery-curation serde: BOTH directions (build +
// parse) over ONE canonical shape, so the two halves can never drift (the card/chat/tag serde precedent).
// PURE: zero I/O, zero db, zero id-resolution — it maps a `GalleryExport` (an owner's curated `gallery_items`
// rows, projected id-less) to/from the orb-native `.json` interchange bytes. The RELATIONAL work stays OUT of
// here, in the assets domain's gallery export/import verbs:
//   - export reads the owner's `gallery_items` rows, resolves each `subjectCharacterId` to the character's
//     HANDLE, projects to a `CanonicalGalleryItem`, and calls `buildGallery`.
//   - import calls `parseGallery`, then re-links each carried handle to the owner's OWN character id (or null
//     when that character does not exist on this box), and writes the `gallery_items` rows (a fresh
//     `GalleryItemId` is minted at write time, never carried in the file).
//
// THE RE-LINK: the subject character travels as its HANDLE, never the raw `subjectCharacterId` — character
// ids are not preserved across a fresh box (the same reason chat bundles resolve by handle). `assetId` IS
// carried as-is (Option A): the `assets` entity restores the blob under its ORIGINAL id BEFORE gallery imports
// (`PORTABLE_IMPORT_ORDER`), so the id is stable and re-links with no remap.
//
// orb-NATIVE ONLY: SillyTavern has no per-character curated-gallery concept, so there is NO ST-compat adapter
// here.
//
// The envelope is the uniform {schemaKind, schemaVersion} header (the `NeoPresetFile`/tag precedent) so a
// forward-compat lift-walk can key off the version. `parseGallery` REJECTS a foreign/absent `schemaKind`
// (returns null) and drops malformed rows (resilient, never fatal for one bad entry).
//
// Round-trip drift guard: buildGallery(parseGallery(buildGallery(x))) deep-equals buildGallery(x) — pinned in
// the mirror test (the SERIALIZED bytes are the stable fixed point; deterministic key order makes the
// round-trip byte-identical).

import type { AssetId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

// The wire discriminant + schema version. `schemaKind` fences a gallery file from every other portable file
// (the upload router routes on it); `schemaVersion` is the lift-walk key for a future shape change.
export const GALLERY_SCHEMA_KIND = "orb.gallery";
export const GALLERY_SCHEMA_VERSION = 1;

// ── the canonical shape (id-less, owner-less; the serde owns its wire shape, server/kit type-home-exempt) ──

/** One curation row as it travels in a gallery file: the curated `assetId` (carried AS-IS — Option A, the
 *  blob restores under its original id), the subject character's HANDLE (null for an un-charactered item; the
 *  raw `subjectCharacterId` is NEVER carried — ids do not survive a fresh box), and the curation timestamp.
 *  NO `GalleryItemId` (a fresh id is minted on import), NO `ownerId` (ownership derives through the asset FK).
 *  `createdAt` is null when unrecorded (import stamps the clock). */
export interface CanonicalGalleryItem {
  readonly assetId: AssetId;
  readonly subjectCharacterHandle: string | null;
  readonly createdAt: number | null;
}

/** An owner's whole curated gallery as a portable set — just the `gallery_items` curation rows. The BLOBS
 *  travel via the `assets` entity (this carries only the curation); a gallery file restored on its own re-links
 *  each row to an already-restored asset + character. */
export interface GalleryExport {
  readonly items: readonly CanonicalGalleryItem[];
}

// ── build (GalleryExport -> JSON bytes) ────────────────────────────────────────────────────────────────────

/** Serialize ONE canonical item with a DETERMINISTIC key order (the round-trip fixed point). */
function itemToWire(item: CanonicalGalleryItem): Record<string, unknown> {
  return {
    assetId: item.assetId,
    subjectCharacterHandle: item.subjectCharacterHandle,
    createdAt: item.createdAt,
  };
}

/**
 * Serialize a `GalleryExport` to the orb-native gallery JSON interchange bytes (the inverse of
 * `parseGallery`). The schemaKind + schemaVersion envelope wraps the ordered curation rows; UTF-8 encoded.
 * Deterministic key order makes the round-trip byte-identical. PURE.
 */
export function buildGallery(gallery: GalleryExport): Uint8Array {
  const wire = {
    schemaKind: GALLERY_SCHEMA_KIND,
    schemaVersion: GALLERY_SCHEMA_VERSION,
    items: gallery.items.map(itemToWire),
  };
  return new TextEncoder().encode(JSON.stringify(wire, null, 2));
}

// ── parse (JSON bytes -> GalleryExport | null) ─────────────────────────────────────────────────────────────

// A lenient per-row view: `assetId` is REQUIRED as a non-empty branded id (a curation row with no asset is
// meaningless -> the row is dropped). Deliberately NOT `typeIdSchema` (prefix-strict): the assetId is an
// OPAQUE carried value re-linked against the db by the import verb's ownership gate — an unknown/foreign id is
// dropped THERE (skipped), so over-validating the wire would needlessly discard otherwise-restorable rows. The
// subject handle + createdAt coerce (`.catch` degrades a malformed field rather than nulling the whole row).
const wireItemSchema = z.object({
  assetId: brandedId<AssetId>(),
  subjectCharacterHandle: z.string().trim().min(1).nullish().catch(null),
  createdAt: z.number().int().nonnegative().nullish().catch(null),
});

// The envelope: the discriminant is REQUIRED and must match (a foreign file -> parse null); `items` is a
// permissive array (each element re-validated per-row, bad rows dropped).
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

/**
 * Parse orb-native gallery JSON bytes to a `GalleryExport`, or null when the bytes are not a gallery file
 * (non-JSON, or a `schemaKind` that is not {@link GALLERY_SCHEMA_KIND}). Resilient WITHIN a valid file: a
 * single malformed row (missing/blank `assetId`, a non-object) is DROPPED, never fatal. The inverse of
 * `buildGallery`. PURE.
 */
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
