// The one home for the standalone tag-library serde: both directions over one canonical shape. Pure:
// zero I/O, zero db, zero id-resolution — it maps a `TagLibrary` (a per-owner set of tag rows, id-less and
// owner-less) to/from the orb-native .json interchange bytes. orb-native only: SillyTavern has no
// standalone tag-library concept (its tags ride embedded in character cards; that path is
// kit/serde/card's concern).
//
// Round-trip drift guard: buildTagLibrary(parseTagLibrary(buildTagLibrary(x))) deep-equals
// buildTagLibrary(x).

import type { TagFolderType, TagSource } from "@orb/contracts/tag";
import { tagFolderTypeSchema, tagSourceSchema } from "@orb/contracts/tag";
import { z } from "zod";

export const TAG_LIBRARY_SCHEMA_KIND = "orb.tag-library";
export const TAG_LIBRARY_SCHEMA_VERSION = 1;

/** One tag as it travels in the library file: display + presentation axes only. No id (minted on
 *  import), no ownerId (stamped at write time), no createdAt (born at insert). */
export interface CanonicalTag {
  readonly name: string;
  readonly color: string | null;
  readonly color2: string | null;
  readonly source: TagSource | null;
  readonly folderType: TagFolderType;
  readonly sortOrder: number | null;
  readonly isHiddenOnCard: boolean;
}

/** An owner's whole tag namespace as a portable set. Just the tag rows — the per-type junctions are not
 *  part of a standalone tag library; re-attachment rides the other entities' imports. */
export interface TagLibrary {
  readonly tags: readonly CanonicalTag[];
}

/** Serialize one canonical tag with a deterministic key order (the round-trip fixed point). */
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

/** Serialize a `TagLibrary` to the orb-native tag-library JSON interchange bytes (the inverse of
 *  `parseTagLibrary`). Deterministic key order makes the round-trip byte-identical. */
export function buildTagLibrary(library: TagLibrary): Uint8Array {
  const wire = {
    schemaKind: TAG_LIBRARY_SCHEMA_KIND,
    schemaVersion: TAG_LIBRARY_SCHEMA_VERSION,
    tags: library.tags.map(tagToWire),
  };
  return new TextEncoder().encode(JSON.stringify(wire, null, 2));
}

// A lenient per-row view: the axes validate (a bad source/folderType/name fails this row → dropped); the
// display fields coerce via .catch to a safe default rather than nulling the row.
const wireTagSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().nullish().catch(null),
  color2: z.string().nullish().catch(null),
  source: tagSourceSchema.nullish().catch(null),
  folderType: tagFolderTypeSchema.catch("NONE"),
  sortOrder: z.number().int().nullish().catch(null),
  isHiddenOnCard: z.boolean().catch(false),
});

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

/** Parse orb-native tag-library JSON bytes to a `TagLibrary`, or null when the bytes are not a tag-library
 *  file. Resilient within a valid file: a single malformed tag row is dropped, never fatal. */
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
