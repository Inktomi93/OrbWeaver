// verb: findOwnedBooks — the read-only twin of the standalone book import's reuse test, for a preview that must
// not write. It judges the list in the order the import lands it, so a book equal to an earlier one answers
// "upload". It loads the owner's library once and yields between books, so a folder of thousands never holds the
// event loop.

import type { ImportAnswer } from "@orb/contracts/import";
import type { FindOwnedBooks } from "@orb/contracts/world-info";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { mapYielding } from "#primitives/abort";
import { bookReuseJudge } from "#primitives/serde/world-info";
import type { WorldInfoImportContext } from "../contract/import.ts";
import { loadOwnedBooksForDedup, toDedupBook } from "../persistence/import-write.ts";

export function createFindOwnedBooks(input: DbAssemblyInput<Pick<WorldInfoImportContext, "db">>): FindOwnedBooks {
  const db = databaseForOwner(input.db);
  return async ({ ownerId, books, signal }): Promise<readonly ImportAnswer[]> => {
    if (books.length === 0) {
      return [];
    }
    const judge = bookReuseJudge(await loadOwnedBooksForDedup(db, ownerId));
    return await mapYielding(books, signal, (book) => judge(toDedupBook(book)));
  };
}
