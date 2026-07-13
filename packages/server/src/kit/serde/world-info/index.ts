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

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import { z } from "zod";

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

// Not .strict() — an unknown top-level key from a newer writer rides through (forward-tolerant), but a
// modelled field that mistypes fails the parse to null.
const fileSchema = z.object({
  schemaKind: z.literal(WORLD_INFO_SCHEMA_KIND),
  version: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  entries: z.array(fileEntrySchema),
});

/** Serialize the canonical lorebook shape to the portable worlds/*.json text (the inverse of
 *  `parseWorldBookFile`). Every field in a fixed key order so a re-serialize is byte-identical. */
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

/** Parse an untrusted worlds/*.json upload into the canonical `BulkImportLorebookInput` (the inverse of
 *  `buildWorldBookFile`), or null when malformed. The caller's import verb maps null to an isolated
 *  per-file failure, never a thrown bundle abort. */
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
