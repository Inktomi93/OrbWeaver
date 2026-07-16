// verb: export — standalone world-info-book export: reads the owner's book + entries, projects onto
// `BulkImportLorebookInput`, and emits the portable `worlds/*.json` via `buildWorldBookFile`.
// Foreign/absent book returns null (leak-free — "not yours" and "doesn't exist" are one answer).

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import { slugifyHandle } from "@orb/kit/slug";
import { buildWorldBookFile } from "#kit/serde/world-info";
import type { ExportedWorldBook, ExportWorldBook, WorldInfoExportContext } from "../contract/export";
import { listBookEntries, loadOwnedBook } from "../persistence/queries";

export function createExport(ctx: WorldInfoExportContext): ExportWorldBook {
  return async ({ ownerId, bookId }): Promise<ExportedWorldBook | null> => {
    const book = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (book === undefined) {
      return null;
    }
    const entries = await listBookEntries(ctx.db, bookId);
    const canonical: BulkImportLorebookInput = {
      name: book.name,
      description: book.description,
      entries: entries.map((e) => ({
        title: e.title,
        description: e.description,
        content: e.content,
        // The stored `keys` is NULL when unset (the world_entries NULL-vs-empty asymmetry); the wire always
        // carries an array, so null-restore to `[]` here (the writer re-collapses on re-import).
        keys: e.keys ?? [],
        enabled: e.enabled,
        priority: e.priority,
        ignoreBudget: e.ignoreBudget,
        // The lossless stored blob (typed `EntryMetadata` at the DB seam) rides through as the raw record.
        metadata: e.metadata ?? null,
      })),
    };
    return {
      filename: `${slugifyHandle(book.name)}.json`,
      bytes: new TextEncoder().encode(buildWorldBookFile(canonical)),
    };
  };
}
