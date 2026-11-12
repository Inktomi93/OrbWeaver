// verb: export — standalone world-info-book export: reads the owner's book + entries, projects onto
// `BulkImportLorebookInput`, and emits the portable `worlds/*.json` via `buildWorldBookFile`.
// Foreign/absent book returns null (leak-free — "not yours" and "doesn't exist" are one answer). An entry whose stored
// metadata is not JSON is written without it and reported to `note`, never dropped silently.

import type { PortableFile } from "@orb/contracts/portability";
import { PORTABLE_EXPORT_CARRY } from "@orb/contracts/portability";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import type { BulkImportLorebookInput, ExportWorldBook } from "@orb/contracts/world-info";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { UnreadableJsonText } from "@orb/kit/json";
import { slugifyHandle } from "@orb/kit/slug";
import { buildWorldBookFile } from "#primitives/serde/world-info";
import { STORED_CONFIG_UNREADABLE } from "#primitives/stored-config";
import type { WorldInfoExportContext } from "../contract/export.ts";
import { listBookEntries, loadOwnedBook } from "../persistence/queries.ts";

export function createExportWorldBook(input: DbAssemblyInput<WorldInfoExportContext>): ExportWorldBook {
  const ctx: WorldInfoExportContext = { ...input, db: databaseForOwner(input.db) };
  return async ({ ownerId, bookId, note }): Promise<PortableFile | null> => {
    const book = await loadOwnedBook(ctx.db, ownerId, bookId);
    if (book === undefined) {
      return null;
    }
    const entries = await listBookEntries(ctx.db, bookId);
    const canonical: BulkImportLorebookInput = {
      name: book.name,
      description: book.description,
      entries: entries.map((e) => {
        if (e.metadata instanceof UnreadableJsonText) {
          note({
            kind: "world-info",
            item: `${book.name}: ${e.title}`,
            code: STORED_CONFIG_UNREADABLE,
            failure: VERSIONED_PARSE_FAILURES.notJson,
            carried: PORTABLE_EXPORT_CARRY.withoutMetadata,
          });
        }
        return {
          title: e.title,
          description: e.description,
          content: e.content,
          // The stored `keys` is NULL when unset (the world_entries NULL-vs-empty asymmetry); the wire always
          // carries an array, so null-restore to `[]` here (the writer re-collapses on re-import).
          keys: e.keys ?? [],
          enabled: e.enabled,
          priority: e.priority,
          ignoreBudget: e.ignoreBudget,
          // The lossless stored blob (typed `EntryMetadata` at the DB seam) rides through as the raw record; stored text
          // that is not JSON leaves as none, reported above.
          metadata: e.metadata instanceof UnreadableJsonText ? null : e.metadata,
        };
      }),
    };
    return {
      filename: `${slugifyHandle(book.name)}.json`,
      bytes: buildWorldBookFile(canonical),
    };
  };
}
