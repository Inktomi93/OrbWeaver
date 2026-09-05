// persistence/card — the write queries. Load-bearing: insertCharacter classifies a per-owner handle
// collision into CharacterOperationError(handle_conflict); writeCardInPlace + deleteOwnedCharacter +
// setArchivedBulk are owner-scoped (a foreign owner is a no-op / false). Internal files imported by
// RELATIVE path.

import { characterSnapshots, characters } from "@orb/db";
import type { CharacterHandle, CharacterId, CharacterSnapshotId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { CharacterOperationError } from "../../../../../packages/server/src/domain/character/contract/errors.ts";
import {
  appendSnapshot,
  deleteOwnedCharacter,
  insertCharacter,
  insertCharacterClaimingProvenance,
  restoreCardInPlace,
  setArchivedBulk,
  writeCardInPlace,
} from "../../../../../packages/server/src/domain/character/persistence/card.ts";
import { buildGroupCard } from "../../../../../packages/server/src/domain/character/substrate/group-character.ts";
import { bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
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
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("dup")), bumpStatsCanonVersion);
    const dup = insertCharacter(db, makeRow(owner, "character_2", castId<CharacterHandle>("dup")), bumpStatsCanonVersion);
    await expect(dup).rejects.toBeInstanceOf(CharacterOperationError);
  });

  test("writeCardInPlace is owner-scoped ('missing' for a foreign owner)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const id = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("a")), bumpStatsCanonVersion);

    // The verb returns a three-state verdict, not a boolean (934fae273): a foreign owner is indistinguishable
    // from an absent row ON PURPOSE — the leak-free collapse, so a scoped write can never be an existence
    // oracle. `background-unavailable` is the third arm and is covered by its own test below.
    expect(await writeCardInPlace(db, { characterId: id, ownerId: other }, { name: "Hax" })).toBe("missing");
    expect(await writeCardInPlace(db, { characterId: id, ownerId: owner }, { name: "Ok" })).toBe("written");
    const rows = await db.select().from(characters).where(eq(characters.id, id));
    expect(rows[0]?.name).toBe("Ok");
  });

  test("writeCardInPlace with an expected BASIS refuses TOTALLY when the card moved (#1446, #1560)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("a")), bumpStatsCanonVersion);
    const basis = { contentHash: "hash", creatorNotes: null } as const;

    // The declared basis matches ⇒ the ordinary write, and the new hash lands.
    expect(await writeCardInPlace(db, { characterId: id, ownerId: owner, expectedBasis: basis }, { name: "First", contentHash: "hash-2" })).toBe("written");
    // A caller still holding the ORIGINAL basis is writing from a snapshot that no longer exists. It must not
    // win: `"stale"` is a TOTAL refusal, so the first writer's row stands untouched rather than being
    // silently replaced by a patch merged against content nobody can see any more.
    expect(await writeCardInPlace(db, { characterId: id, ownerId: owner, expectedBasis: basis }, { name: "Second", contentHash: "hash-3" })).toBe("stale");
    expect((await db.select().from(characters).where(eq(characters.id, id)))[0]?.name).toBe("First");
    // THE BASIS IS MORE THAN THE HASH (#1560): `creatorNotes` is outside the identity hash on purpose, so a
    // notes-only edit moves no hash — and a caller whose basis says "no notes" must still lose to it.
    await writeCardInPlace(db, { characterId: id, ownerId: owner }, { creatorNotes: "the other writer's note" });
    expect(
      await writeCardInPlace(db, { characterId: id, ownerId: owner, expectedBasis: { contentHash: "hash-2", creatorNotes: null } }, { name: "Fourth" }),
    ).toBe("stale");
    expect((await db.select().from(characters).where(eq(characters.id, id)))[0]?.name).toBe("First");
    // …and the SAME write with the notes it actually observed goes through (the fence is a comparison, not
    // a permanent lock: `= NULL` matches nothing in SQL, so the null arm is `IS NULL` or every noted card
    // would refuse forever).
    expect(
      await writeCardInPlace(
        db,
        { characterId: id, ownerId: owner, expectedBasis: { contentHash: "hash-2", creatorNotes: "the other writer's note" } },
        {
          name: "Fourth",
        },
      ),
    ).toBe("written");
    // The predicate does not become an existence oracle: a foreign owner still collapses to "missing" even
    // when the basis they name is the live one.
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    expect(
      await writeCardInPlace(
        db,
        { characterId: id, ownerId: other, expectedBasis: { contentHash: "hash-2", creatorNotes: "the other writer's note" } },
        {
          name: "Hax",
        },
      ),
    ).toBe("missing");
    // …and an omitted basis is the unchanged in-place write (D28's default posture, untouched).
    expect(await writeCardInPlace(db, { characterId: id, ownerId: owner }, { name: "Third" })).toBe("written");
  });

  test("insertCharacterClaimingProvenance lets ONE writer claim a provenance key (#1432)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const first = { ...makeRow(owner, "character_1", castId<CharacterHandle>("a")), importedFrom: "handoff:chat_1:character_src" };
    const second = { ...makeRow(owner, "character_2", castId<CharacterHandle>("b")), importedFrom: "handoff:chat_1:character_src" };

    expect(await insertCharacterClaimingProvenance(db, first, bumpStatsCanonVersion)).toBe(true);
    // The claim is the WRITE's own predicate, not a prior read: a second writer with the same key lands
    // nothing and is told so, which is what lets the caller converge on the winner instead of minting a
    // second library for one gift.
    expect(await insertCharacterClaimingProvenance(db, second, bumpStatsCanonVersion)).toBe(false);
    expect(await db.select().from(characters).where(eq(characters.ownerId, owner))).toHaveLength(1);
    // The claim is PER-OWNER: the same key under a different recipient is a different gift.
    const foreign = { ...makeRow(other, "character_3", castId<CharacterHandle>("c")), importedFrom: "handoff:chat_1:character_src" };
    expect(await insertCharacterClaimingProvenance(db, foreign, bumpStatsCanonVersion)).toBe(true);
  });

  test("deleteOwnedCharacter is owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const id = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("a")), bumpStatsCanonVersion);
    expect(await deleteOwnedCharacter(db, id, other, bumpStatsCanonVersion)).toBe(false);
    expect(await deleteOwnedCharacter(db, id, owner, bumpStatsCanonVersion)).toBe(true);
  });

  test("appendSnapshot writes a history row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("a")), bumpStatsCanonVersion);
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

  test("restoreCardInPlace writes the card and the pre-restore snapshot as ONE unit", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const characterId = castId<CharacterId>("character_1");
    await insertCharacter(db, makeRow(owner, "character_1", castId<CharacterHandle>("a")), bumpStatsCanonVersion);
    const preRestore = {
      id: castId<CharacterSnapshotId>("character_snapshot_pre"),
      characterId,
      content: buildGroupCard(),
      label: "auto: before restore",
      createdAt: 2,
    };

    // A refused write records NOTHING. The pre-restore snapshot used to be its own committed INSERT ahead
    // of the update, so a restore that could not land still left a "before restore" boundary in the
    // history — one per retry.
    expect(await restoreCardInPlace(db, { characterId, ownerId: other }, { name: "Restored" }, preRestore)).toBe("missing");
    expect(await db.select().from(characterSnapshots)).toEqual([]);
    expect((await db.select().from(characters).where(eq(characters.id, characterId)))[0]?.name).toBe("X");

    // The owner's restore lands both halves.
    expect(await restoreCardInPlace(db, { characterId, ownerId: owner }, { name: "Restored" }, preRestore)).toBe("written");
    expect(await db.select().from(characterSnapshots)).toHaveLength(1);
    expect((await db.select().from(characters).where(eq(characters.id, characterId)))[0]?.name).toBe("Restored");
  });

  test("setArchivedBulk flips only the owner's listed ids", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = castId<CharacterId>("character_a");
    const b = castId<CharacterId>("character_b");
    await insertCharacter(db, makeRow(owner, "character_a", castId<CharacterHandle>("a")), bumpStatsCanonVersion);
    await insertCharacter(db, makeRow(owner, "character_b", castId<CharacterHandle>("b")), bumpStatsCanonVersion);
    const flipped = await setArchivedBulk(db, owner, [a, b], { archived: true, updatedAt: FROZEN_AT_MS });
    expect(flipped).toHaveLength(2);
    const rows = await db.select().from(characters);
    expect(rows.every((r) => r.archived)).toBe(true);
  });
});
