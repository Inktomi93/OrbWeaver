// The one standalone world-info-book serde core: the portable worlds/*.json grammar with both directions
// in one home, so build + parse can never drift. Pure: zero I/O, zero db, zero id-resolution — it maps the
// canonical lorebook shape (BulkImportLorebookInput, the same shape the embedded-in-card bulk-import
// writes) to/from a self-describing JSON file with a schemaKind + version envelope.
//
// This is the standalone lone-book file path. The embedded-in-card book path is #kit/serde/card
// (extractLorebook + loreEntryColumns/loreEntryMetadata) and is unchanged — the two formats stay
// independent.
//
// Round-trip drift guard: buildWorldBookFile(parseWorldBookFile(buildWorldBookFile(b))) equals
// buildWorldBookFile(b).

import type { PortableParse } from "@orb/contracts/portability";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import { z } from "zod";
import { defineJsonRowsSerde } from "#kit/serde/lib";

export const WORLD_INFO_SCHEMA_KIND = "orb.world-info.book";
const SCHEMA_VERSION = 1;

// keys is always an array (empty, never omitted — the null-collapse to world_entries.keys is the writer's
// job); metadata is the raw entry blob, passed through untouched.
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

// The book's own top-level fields, beside the envelope and the entry array. Not .strict() — an unknown
// top-level key from a newer writer rides through (forward-tolerant).
const headerSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
});

const worldBookSerde = defineJsonRowsSerde<BulkImportLorebookInput, BulkImportLorebookInput["entries"][number], z.infer<typeof headerSchema>>({
  schemaKind: WORLD_INFO_SCHEMA_KIND,
  schemaVersion: SCHEMA_VERSION,
  // ACCEPT-OLD-FOREVER: books written before the envelope was uniform spell the version key `version`.
  // Build emits `schemaVersion`; both keys parse, forever (portable files are external artifacts —
  // NO-LEGACY governs the db, not a user's on-disk lorebook).
  legacyVersionKeys: ["version"],
  plural: "entries",
  rowSchema: fileEntrySchema,
  // DECLARED opt-in (O-8): a lorebook is an integral whole — an entry silently missing from a restored
  // book is a worse outcome than a refused file, because the book still LOOKS complete.
  rowPolicy: "reject-file",
  headerSchema,
  toWire: (book) => ({
    header: { name: book.name, description: book.description },
    rows: book.entries.map((e) => ({
      title: e.title,
      description: e.description,
      content: e.content,
      keys: [...e.keys],
      enabled: e.enabled,
      priority: e.priority,
      ignoreBudget: e.ignoreBudget,
      metadata: e.metadata,
    })),
  }),
  fromWire: (entries, header) => ({
    name: header.name,
    description: header.description,
    entries: entries.map((e) => ({
      title: e.title,
      description: e.description,
      content: e.content,
      keys: e.keys,
      enabled: e.enabled,
      priority: e.priority,
      ignoreBudget: e.ignoreBudget,
      metadata: e.metadata,
    })),
  }),
});

/** Serialize the canonical lorebook shape to the portable world-info book bytes (the inverse of
 *  `parseWorldBookFile`). Every field in a fixed key order so a re-serialize is byte-identical. */
export function buildWorldBookFile(book: BulkImportLorebookInput): Uint8Array {
  return worldBookSerde.build(book);
}

/** Parse an untrusted world-info book upload into the canonical `BulkImportLorebookInput` (the inverse of
 *  `buildWorldBookFile`), or the typed reason it was refused. The caller's import verb maps the refusal to
 *  an isolated per-file failure, never a thrown bundle abort. */
export function parseWorldBookFile(bytes: Uint8Array): PortableParse<BulkImportLorebookInput> {
  return worldBookSerde.parse(bytes);
}
