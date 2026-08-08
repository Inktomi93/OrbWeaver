// Mirror int-test for domain/world-info/verbs/createListOwnedBookIds — the enumeration the bundle
// descriptor's `exportAll` streams over (F8: the composition root used to run this query itself). The
// load-bearing property is the OWNER SCOPE: a bundle that enumerated a stranger's books would export them.

import type { Db } from "@orb/db";
import { worldBooks } from "@orb/db";
import type { UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createListOwnedBookIds } from "../../../../../packages/server/src/domain/world-info/verbs/list-owned-book-ids.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;

async function seedBook(db: Db, ownerId: UserId, id: string, name: string): Promise<void> {
  await db.insert(worldBooks).values({ id: castId<WorldBookId>(id), ownerId, name, description: null, createdAt: NOW });
}

describe("createListOwnedBookIds", () => {
  test("returns every book the owner owns, and NEVER a stranger's", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const stranger = await seedUser(db, {});
    await seedBook(db, owner.id, "world_book_mine_a", "Mine A");
    await seedBook(db, owner.id, "world_book_mine_b", "Mine B");
    await seedBook(db, stranger.id, "world_book_theirs", "Theirs");

    const ids = await createListOwnedBookIds({ db })({ ownerId: owner.id });

    expect(ids.toSorted()).toEqual(["world_book_mine_a", "world_book_mine_b"]);
  });

  test("an owner with no books enumerates empty (never every book on the box)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const stranger = await seedUser(db, {});
    await seedBook(db, stranger.id, "world_book_theirs", "Theirs");

    expect(await createListOwnedBookIds({ db })({ ownerId: owner.id })).toEqual([]);
  });
});
