// verb: export (W-worldinfo; export-import-portability.md §1) — the STANDALONE world-info-book export: read
// the owner's book + its entries, project onto the canonical `BulkImportLorebookInput`, and emit the portable
// `worlds/*.json` file via the ONE standalone serde core (`#kit/serde/world-info` `buildWorldBookFile`). The
// RELATIONAL work (the owner-scoped read + the row→canonical projection) lives HERE; the serde stays pure.
// `import.ts` is the round-trip twin.
//
// Owner-scoped: a foreign / absent book returns null (leak-free, matching the owner-scoped book reads —
// "not yours" and "doesn't exist" are one answer). Entries emit in the `listBookEntries` order (descending
// priority — deterministic). The filename slugs the book name (`@orb/kit/slug`); the registry descriptor
// prefixes the bundle `dir`. This is the standalone lone-book file only — the EMBEDDED-in-card book path is
// the card export verb (`#kit/serde/card` OUT).

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import { slugifyHandle } from "@orb/kit/slug";
import { buildWorldBookFile } from "#kit/serde/world-info";
import type {
  ExportedWorldBook,
  ExportWorldBook,
  WorldInfoExportContext,
} from "../contract/export";
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
