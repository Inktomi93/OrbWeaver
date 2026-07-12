// @orb/server/kit/serde/tag — the ONE home for the standalone tag-library serde: BOTH directions (build +
// parse) over ONE canonical shape, so the two halves can never drift (the card/chat-serde precedent). PURE:
// zero I/O, zero db, zero id-resolution — it maps a `TagLibrary` (a per-owner set of tag rows, id-less and
// owner-less) to/from the orb-native `.json` interchange bytes. The RELATIONAL work stays OUT of here, in the
// tag domain's export/import verbs:
//   - export reads the owner's `tags` rows, projects each to a `CanonicalTag`, and calls `buildTagLibrary`.
//   - import calls `parseTagLibrary`, then mints/dedupes the owner's own `tags` rows (a fresh id + the owner
//     stamp are applied at write time, never carried in the file).
// So the serde only ever sees id-less, owner-less tag values — never a db handle, a `TagId`, or a `UserId`.
//
// orb-NATIVE ONLY: SillyTavern has no standalone tag-library concept (its tags ride embedded in character
// cards), so there is NO ST-compat adapter here — the embedded-card path is `kit/serde/card`'s concern.
//
// The envelope is the uniform `{schemaKind, schemaVersion}` header (the `PresetFile` precedent) so a
// forward-compat lift-walk can key off the version. `parseTagLibrary` REJECTS a foreign/absent `schemaKind`
// (returns null) and drops malformed rows (resilient, never fatal for one bad entry).
//
// Round-trip drift guard: buildTagLibrary(parseTagLibrary(buildTagLibrary(x))) deep-equals buildTagLibrary(x)
// — pinned in the mirror test (the SERIALIZED bytes are the stable fixed point; deterministic key order makes
// the round-trip byte-identical).

import type { TagFolderType, TagSource } from "@orb/contracts/tag";
import { tagFolderTypeSchema, tagSourceSchema } from "@orb/contracts/tag";
import { z } from "zod";

// The wire discriminant + schema version. `schemaKind` fences a tag-library file from every other portable
// file (an upload router routes on it); `schemaVersion` is the lift-walk key for a future shape change.
export const TAG_LIBRARY_SCHEMA_KIND = "orb.tag-library";
export const TAG_LIBRARY_SCHEMA_VERSION = 1;

// ── the canonical shape (id-less, owner-less; the serde owns its wire shape, server/kit type-home-exempt) ──

/** One tag as it travels in the library file: the display + presentation axes ONLY. NO `id` (a fresh id is
 *  minted on import), NO `ownerId` (the importing owner is stamped at write time), NO `createdAt` (born at
 *  insert). `color`/`color2` are null for the theme default; `sortOrder` is null when unordered; `source` is
 *  the nullable provenance axis. Mirrors `TagView` minus `id`. */
export interface CanonicalTag {
  readonly name: string;
  readonly color: string | null;
  readonly color2: string | null;
  readonly source: TagSource | null;
  readonly folderType: TagFolderType;
  readonly sortOrder: number | null;
  readonly isHiddenOnCard: boolean;
}

/** An owner's whole tag namespace as a portable set. Just the tag rows — the five per-type junctions
 *  (character/chat/... attachments) are NOT part of a standalone tag library (they reference OTHER entities;
 *  a card carries its own tag attachments via `kit/serde/card`). Restoring a library re-creates the tag
 *  namespace; re-attachment rides the other entities' imports. */
export interface TagLibrary {
  readonly tags: readonly CanonicalTag[];
}

// ── build (TagLibrary → JSON bytes) ──────────────────────────────────────────────────────────────────────

/** Serialize ONE canonical tag with a DETERMINISTIC key order (the round-trip fixed point). */
function tagToWire(t: CanonicalTag): Record<string, unknown> {
  return {
    name: t.name,
    color: t.color,
    color2: t.color2,
    source: t.source,
    folderType: t.folderType,
    sortOrder: t.sortOrder,
    isHiddenOnCard: t.isHiddenOnCard,
  };
}

/**
 * Serialize a `TagLibrary` to the orb-native tag-library JSON interchange bytes (the inverse of
 * `parseTagLibrary`). The `{schemaKind, schemaVersion}` envelope wraps the ordered tag rows; UTF-8 encoded.
 * Deterministic key order makes the round-trip byte-identical. PURE.
 */
export function buildTagLibrary(library: TagLibrary): Uint8Array {
  const wire = {
    schemaKind: TAG_LIBRARY_SCHEMA_KIND,
    schemaVersion: TAG_LIBRARY_SCHEMA_VERSION,
    tags: library.tags.map(tagToWire),
  };
  return new TextEncoder().encode(JSON.stringify(wire, null, 2));
}

// ── parse (JSON bytes → TagLibrary | null) ───────────────────────────────────────────────────────────────

// A lenient per-row view: the axes VALIDATE (a bad source/folderType/name fails THIS row → dropped), the
// display fields coerce. `.catch` degrades a malformed axis to a safe default rather than nulling the row.
const wireTagSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().nullish().catch(null),
  color2: z.string().nullish().catch(null),
  source: tagSourceSchema.nullish().catch(null),
  folderType: tagFolderTypeSchema.catch("NONE"),
  sortOrder: z.number().int().nullish().catch(null),
  isHiddenOnCard: z.boolean().catch(false),
});

// The envelope: the discriminant is REQUIRED and must match (a foreign file → parse null); `tags` is a
// permissive array (each element re-validated per-row, bad rows dropped).
const wireLibrarySchema = z.object({
  schemaKind: z.literal(TAG_LIBRARY_SCHEMA_KIND),
  schemaVersion: z.number().int().positive(),
  tags: z.array(z.unknown()),
});

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Parse orb-native tag-library JSON bytes to a `TagLibrary`, or null when the bytes are not a tag-library file
 * (non-JSON, or a `schemaKind` that is not {@link TAG_LIBRARY_SCHEMA_KIND}). Resilient WITHIN a valid file: a
 * single malformed tag row (missing/blank name, a non-object) is DROPPED, never fatal. The inverse of
 * `buildTagLibrary`. PURE.
 */
export function parseTagLibrary(bytes: Uint8Array): TagLibrary | null {
  const envelope = wireLibrarySchema.safeParse(decodeJson(bytes));
  if (!envelope.success) {
    return null;
  }
  const tags: CanonicalTag[] = [];
  for (const raw of envelope.data.tags) {
    const row = wireTagSchema.safeParse(raw);
    if (!row.success) {
      continue;
    }
    const t = row.data;
    tags.push({
      name: t.name,
      color: t.color ?? null,
      color2: t.color2 ?? null,
      source: t.source ?? null,
      folderType: t.folderType,
      sortOrder: t.sortOrder ?? null,
      isHiddenOnCard: t.isHiddenOnCard,
    });
  }
  return { tags };
}
