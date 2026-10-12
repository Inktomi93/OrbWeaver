// Integration: the ONE `characters` belt discovery's owner analytics wear (#1467 item 1). Proofs: the
// owner-required form drops BOTH a foreign owner's cards and this owner's synthetic per-room group buckets; the
// ALL-OWNERS form (the bulk passes) drops the owner half and keeps the synthetic half.

import { characters } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, expectTypeOf } from "vitest";
import { ownedRealCharacters, realCharactersOfEveryOwner } from "#server/domain/discovery/persistence/character-scope.ts";
import { seedCharacter, seedUser } from "../_support.ts";

describe("ownedRealCharacters", () => {
  test("owner-scoped: keeps the owner's real cards, drops synthetic ones and other owners'", async () => {
    const db = await freshDb();
    const mine = await seedUser(db, "user_a");
    const theirs = await seedUser(db, "user_b");
    const real = await seedCharacter(db, { id: "character_real", ownerId: mine });
    await seedCharacter(db, { id: "character_group", ownerId: mine, synthetic: true });
    await seedCharacter(db, { id: "character_foreign", ownerId: theirs });

    const rows = await db.select({ id: characters.id }).from(characters).where(ownedRealCharacters(mine));

    expect(rows.map((r) => r.id)).toEqual([real]);
  });

  test("owner-required: another owner's real card never answers for this owner, even when it is the only card", async () => {
    // A compile-time pin: root typecheck reds this file if an absent owner becomes admissible again.
    expectTypeOf<undefined>().not.toExtend<Parameters<typeof ownedRealCharacters>[0]>();
    expectTypeOf<null>().not.toExtend<Parameters<typeof ownedRealCharacters>[0]>();
    expectTypeOf<UserId>().toExtend<Parameters<typeof ownedRealCharacters>[0]>();
    const db = await freshDb();
    const mine = await seedUser(db, "user_a");
    const theirs = await seedUser(db, "user_b");
    const foreign = await seedCharacter(db, { id: "character_foreign", ownerId: theirs });

    const asMine = await db.select({ id: characters.id }).from(characters).where(ownedRealCharacters(mine));
    const asTheirs = await db.select({ id: characters.id }).from(characters).where(ownedRealCharacters(theirs));

    expect(asMine).toEqual([]);
    // The positive control: the same card answers for its real owner, so the empty read above is the owner refusal.
    expect(asTheirs.map((r) => r.id)).toEqual([foreign]);
  });
});

describe("realCharactersOfEveryOwner", () => {
  test("ALL-OWNERS: keeps every owner's real cards and still drops the synthetic buckets", async () => {
    const db = await freshDb();
    const mine = await seedUser(db, "user_a");
    const theirs = await seedUser(db, "user_b");
    const a = await seedCharacter(db, { id: "character_a", ownerId: mine });
    const b = await seedCharacter(db, { id: "character_b", ownerId: theirs });
    await seedCharacter(db, { id: "character_group", ownerId: mine, synthetic: true });

    const rows = await db.select({ id: characters.id }).from(characters).where(realCharactersOfEveryOwner());

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([a, b]));
  });
});
