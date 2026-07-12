// @orb/server/kit/serde/world-info — the ONE standalone world-info-book serde core: the portable
// `worlds/*.json` grammar with BOTH directions in one home, so build + parse can never drift (the card /
// chat / persona serde precedent — PD-44 / W0a / W1). PURE: zero I/O, zero db, zero id-resolution — it maps
// the CANONICAL lorebook shape (`BulkImportLorebookInput` from `@orb/contracts/world-info`, the SAME shape
// W1's embedded-in-card bulk-import writes — no parallel shape) to / from a self-describing JSON file with a
// `schemaKind` + `version` envelope (export-import-portability.md R8). The RELATIONAL work stays OUT of here,
// in the world-info domain:
//   • export reads the owner's `world_books` row + its `world_entries` → the canonical
//     `BulkImportLorebookInput` and hands it to `buildWorldBookFile`.
//   • import calls `parseWorldBookFile` on the untrusted upload → the canonical shape → the UNATTACHED owned
//     write (`createImportStandaloneLorebook`, dedup on `(ownerId, name)`, R6).
// So the serde only ever sees the canonical value — never a db handle, an id, or an owner.
//
// This is the STANDALONE lone-book file path. The EMBEDDED-in-card book path is `#kit/serde/card`
// (`extractLorebook` + `loreEntryColumns` / `loreEntryMetadata`) and is unchanged — the two formats stay
// independent (a `worlds/*.json` file is not a character card).
//
// Round-trip drift guard: `buildWorldBookFile(parseWorldBookFile(buildWorldBookFile(b)))` equals
// `buildWorldBookFile(b)` — pinned in the mirror test (the SERIALIZED JSON text is the stable fixed point;
// a malformed re-parse returns null and the pin would throw).

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import { z } from "zod";

/** The portable-file schema identifier — a self-describing envelope tag so a reader can route the file and
 *  a future lift-walk can branch on `version` (the `PresetFile` precedent, export-import-portability.md R8). */
export const WORLD_INFO_SCHEMA_KIND = "orb.world-info.book";
const SCHEMA_VERSION = 1;

// The wire schema for ONE entry inside the file — the `BulkImportLoreEntryInput` fields. `keys` is always an
// array (empty, never omitted — the null-collapse to the `world_entries.keys` NULL-vs-empty asymmetry is the
// WRITER's job, not the wire's); `metadata` is the raw entry blob (`Record | null`), passed through untouched
// (the write op validates it through `entryMetadataSchema` at its seam, never trusting the wire).
const fileEntrySchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  content: z.string(),
  keys: z.array(z.string()),
  enabled: z.boolean(),
  priority: z.number(),
  ignoreBudget: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

// The whole-file wire schema: the envelope (`schemaKind` fixed, `version` numeric) + the book header + its
// entries. Not `.strict()` — an unknown top-level key from a newer writer rides through the `safeParse`
// (forward-tolerant), but a modelled field that mistypes fails the parse to null (the import verb maps null
// to an isolated per-file failure, never a thrown bundle abort).
const fileSchema = z.object({
  schemaKind: z.literal(WORLD_INFO_SCHEMA_KIND),
  version: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  entries: z.array(fileEntrySchema),
});

/**
 * Serialize the canonical lorebook shape to the portable `worlds/*.json` text (the inverse of
 * `parseWorldBookFile`). Emits the `{ schemaKind, version }` envelope + every field in a FIXED key order so
 * a re-serialize is byte-identical (the round-trip fixed point). PURE.
 */
export function buildWorldBookFile(book: BulkImportLorebookInput): string {
  const file = {
    schemaKind: WORLD_INFO_SCHEMA_KIND,
    version: SCHEMA_VERSION,
    name: book.name,
    description: book.description,
    entries: book.entries.map((e) => ({
      title: e.title,
      description: e.description,
      content: e.content,
      keys: [...e.keys],
      enabled: e.enabled,
      priority: e.priority,
      ignoreBudget: e.ignoreBudget,
      metadata: e.metadata,
    })),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Parse an untrusted `worlds/*.json` upload into the canonical `BulkImportLorebookInput` (the inverse of
 * `buildWorldBookFile`), or null when the text is not JSON, is not a `WORLD_INFO_SCHEMA_KIND` file, or fails
 * the shape schema. The caller's import verb maps null to an isolated per-file failure — a malformed file
 * never throws a bundle abort (the delivery-core isolation posture). PURE.
 */
export function parseWorldBookFile(text: string): BulkImportLorebookInput | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return {
    name: parsed.data.name,
    description: parsed.data.description,
    entries: parsed.data.entries.map((e) => ({
      title: e.title,
      description: e.description,
      content: e.content,
      keys: e.keys,
      enabled: e.enabled,
      priority: e.priority,
      ignoreBudget: e.ignoreBudget,
      metadata: e.metadata,
    })),
  };
}
