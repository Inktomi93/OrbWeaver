// persistence/card — the write queries. Load-bearing: insertCharacter classifies a per-owner handle
// collision into CharacterOperationError(handle_conflict); writeCardInPlace + deleteOwnedCharacter +
// setArchivedBulk are owner-scoped (a foreign owner is a no-op / false). Internal files imported by
// RELATIVE path.

import { characterSnapshots, characters } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { CharacterOperationError } from "../../../../../packages/server/src/domain/character/contract/errors.ts";
import {
  appendSnapshot,
  deleteOwnedCharacter,
  insertCharacter,
  setArchivedBulk,
  writeCardInPlace,
} from "../../../../../packages/server/src/domain/character/persistence/card.ts";
import { buildGroupCard } from "../../../../../packages/server/src/domain/character/substrate/group-character.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

function makeRow(ownerId: UserId, id: string, handle: CharacterHandle): typeof characters.$inferInsert {
  return {
    id: castId<CharacterId>(id),
    handle,
    ownerId,
    name: "X",
    contentHash: "hash",
    createdAt: 1,
  };
}

describe("persistence/card", () => {
  test("insertCharacter throws CharacterOperationError(handle_conflict) on a per-owner dup", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("dup")));
    const dup = insertCharacter(db, makeRow(owner, "character_2", castId<CharacterHandle>("dup")));
    await expect(dup).rejects.toBeInstanceOf(CharacterOperationError);
  });

  test("writeCardInPlace is owner-scoped (false for a foreign owner)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const id = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("a")));

    expect(await writeCardInPlace(db, id, other, { name: "Hax" })).toBe(false);
    expect(await writeCardInPlace(db, id, owner, { name: "Ok" })).toBe(true);
    const rows = await db.select().from(characters).where(eq(characters.id, id));
    expect(rows[0]?.name).toBe("Ok");
  });

  test("deleteOwnedCharacter is owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const id = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("a")));
    expect(await deleteOwnedCharacter(db, id, other)).toBe(false);
    expect(await deleteOwnedCharacter(db, id, owner)).toBe(true);
  });

  test("appendSnapshot writes a history row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("a")));
    await appendSnapshot(db, {
      id: castId("character_snapshot_1"),
      characterId,
      content: buildGroupCard(),
      label: "v1",
      createdAt: 2,
    });
    const snaps = await db.select().from(characterSnapshots).where(eq(characterSnapshots.characterId, characterId));
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.label).toBe("v1");
  });

  test("setArchivedBulk flips only the owner's listed ids", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = castId<CharacterId>("character_a");
    const b = castId<CharacterId>("character_b");
    await insertCharacter(db, makeRow(owner, "character_a", castId<CharacterHandle>("a")));
    await insertCharacter(db, makeRow(owner, "character_b", castId<CharacterHandle>("b")));
    const flipped = await setArchivedBulk(db, owner, [a, b], true);
    expect(flipped).toHaveLength(2);
    const rows = await db.select().from(characters);
    expect(rows.every((r) => r.archived)).toBe(true);
  });
});
