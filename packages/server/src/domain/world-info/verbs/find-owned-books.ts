// verb: findOwnedBooks — the read-only twin of the standalone book import's reuse test, for a preview that must
// not write. It loads the owner's library once and yields between books, so a folder of thousands never holds the
// event loop.

import type { FindOwnedBooks } from "@orb/contracts/world-info";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { mapYielding } from "#primitives/abort";
import { bookContentHolder } from "#primitives/serde/world-info";
import type { WorldInfoImportContext } from "../contract/import.ts";
import { loadOwnedBooksForDedup, toDedupBook } from "../persistence/import-write.ts";

export function createFindOwnedBooks(input: DbAssemblyInput<Pick<WorldInfoImportContext, "db">>): FindOwnedBooks {
  const db = databaseForOwner(input.db);
  return async ({ ownerId, books, signal }): Promise<readonly boolean[]> => {
    if (books.length === 0) {
      return [];
    }
    const holds = bookContentHolder(await loadOwnedBooksForDedup(db, ownerId));
    return await mapYielding(books, signal, (book) => holds(toDedupBook(book)));
  };
}
