// verb: findOwnedBooks — the read-only twin of the standalone book import's reuse test, for a preview that must
// not write. It loads the owner's library once and yields between books, so a folder of thousands never holds the
// event loop.

import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { FindOwnedBooks } from "@orb/contracts/world-info";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { bookContentHolder } from "#primitives/serde/world-info";
import type { WorldInfoImportContext } from "../contract/import.ts";
import { loadOwnedBooksForDedup, toDedupBook } from "../persistence/import-write.ts";

export function createFindOwnedBooks(input: DbAssemblyInput<Pick<WorldInfoImportContext, "db">>): FindOwnedBooks {
  const db = databaseForOwner(input.db);
  return async ({ ownerId, books }): Promise<readonly boolean[]> => {
    if (books.length === 0) {
      return [];
    }
    const holds = bookContentHolder(await loadOwnedBooksForDedup(db, ownerId));
    const answers: boolean[] = [];
    for (const book of books) {
      answers.push(holds(toDedupBook(book)));
      await yieldToEventLoop();
    }
    return answers;
  };
}
