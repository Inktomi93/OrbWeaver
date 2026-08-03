// verb: listEmbeddableCharacterIds — the PD-53 bulk embed pass's UN-PRINCIPAL enumeration read (D20).
// Load-bearing: it spans ALL owners (the sweep is a trusted SYSTEM consumer — no owner scope), and it
// excludes synthetic group buckets at the source (they carry no real card text and are never embedded).

import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

describe("listEmbeddableCharacterIds", () => {
  test("spans ALL owners (no owner scope) and excludes synthetic buckets", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const alice = await seedUser(db, { handle: castId<Handle>("alice") });
    const bob = await seedUser(db, { handle: castId<Handle>("bob") });
    const aliceCard = await svc.create({
      principal: principal(alice),
      input: { handle: castId<CharacterHandle>("aria"), name: "Aria", description: "a curious traveler" },
    });
    const bobCard = await svc.create({
      principal: principal(bob),
      input: { handle: castId<CharacterHandle>("bram"), name: "Bram", description: "a grumpy blacksmith" },
    });
    await seedRawCharacter(db, {
      id: "character_group",
      ownerId: alice,
      handle: castId<CharacterHandle>("__group__chat1"),
      name: "Group Bucket",
      synthetic: true,
    });

    const ids = await svc.listEmbeddableCharacterIds();

    // Both owners' real cards, synthetic excluded — the un-principal sweep universe.
    expect([...ids].sort()).toEqual([aliceCard.id, bobCard.id].sort());
  });

  test("an empty library enumerates to an empty universe", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    expect(await svc.listEmbeddableCharacterIds()).toEqual([]);
  });

  test("ownerId scopes the sweep to ONE owner (the workloads SINGULAR embed pass)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const alice = await seedUser(db, { handle: castId<Handle>("alice") });
    const bob = await seedUser(db, { handle: castId<Handle>("bob") });
    const aliceCard = await svc.create({
      principal: principal(alice),
      input: { handle: castId<CharacterHandle>("aria"), name: "Aria", description: "a curious traveler" },
    });
    await svc.create({
      principal: principal(bob),
      input: { handle: castId<CharacterHandle>("bram"), name: "Bram", description: "a grumpy blacksmith" },
    });

    // Alice's singular sweep sees ONLY her card — never bob's.
    expect(await svc.listEmbeddableCharacterIds(alice)).toEqual([aliceCard.id]);
    // null = the whole-corpus bulk sweep (both owners).
    expect((await svc.listEmbeddableCharacterIds(null)).length).toBe(2);
  });
});
