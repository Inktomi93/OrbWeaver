import type { Db } from "@orb/db";
import { characters, tags } from "@orb/db";
import { fetchOwned } from "@orb/db/query";
import type { CharacterId, TagId, UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

declare const db: Db;
declare const ownerId: UserId;
declare const characterId: CharacterId;
declare const tagId: TagId;
declare const rawId: string;
// The door publishes the reader; its table bound is read off the signature.
type OwnedTable = Parameters<typeof fetchOwned>[1];
declare const erasedTable: OwnedTable;

test("the selected table fixes the entity id and inferred row", async () => {
  expectTypeOf(fetchOwned(db, characters, characterId, ownerId)).toEqualTypeOf<Promise<typeof characters.$inferSelect | undefined>>();
  expectTypeOf(fetchOwned(db, tags, tagId, ownerId)).toEqualTypeOf<Promise<typeof tags.$inferSelect | undefined>>();

  // @ts-expect-error a tag id cannot widen the selected character table
  await fetchOwned(db, characters, tagId, ownerId);
  // @ts-expect-error a character id cannot widen the selected tag table
  await fetchOwned(db, tags, characterId, ownerId);
  // @ts-expect-error raw text has not crossed an entity-id boundary
  await fetchOwned(db, characters, rawId, ownerId);
});

test("an erased table retains the string-id floor", async () => {
  expectTypeOf(fetchOwned(db, erasedTable, rawId, ownerId)).toEqualTypeOf<Promise<OwnedTable["$inferSelect"] | undefined>>();

  // @ts-expect-error erasing the table does not admit numeric ids
  await fetchOwned(db, erasedTable, 1, ownerId);
  // @ts-expect-error erasing the table does not admit object ids
  await fetchOwned(db, erasedTable, {}, ownerId);
});
