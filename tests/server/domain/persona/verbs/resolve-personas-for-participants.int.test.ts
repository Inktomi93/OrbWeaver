// op: resolvePersonasForParticipants — the PRINCIPAL-LESS room-plane read (the multi-human resolution widening).
// Load-bearing: the consent gate is `allowedOwnerIds` (the room's PRESENT humans), it lives in the WHERE, and a
// persona outside it is ABSENT rather than refused — the same no-existence-oracle answer `get` gives. The one
// exception is the room's own pin, read through `chatId`. The REFUSAL arms are the point of this file: an op that
// resolved by id alone would hand any room any persona in the database.

import type { Db } from "@orb/db";
import type { ChatId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService, createResolvePersonasForParticipants } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedChat } from "../../../../support/factories/chat.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** Two humans, each with one persona, and an unpinned room. Returns the op under test plus the ids. */
async function seedTwoOwners(): Promise<{
  readonly db: Db;
  readonly room: ChatId;
  readonly resolve: ReturnType<typeof createResolvePersonasForParticipants>;
  readonly alice: UserId;
  readonly bob: UserId;
  readonly alicePersona: PersonaId;
  readonly bobPersona: PersonaId;
}> {
  const db = await freshDb();
  const harness = makeHarness(db);
  const svc = createPersonaService(harness.ctx);
  const alice = await seedUser(db, { handle: castId<Handle>("alice") });
  const bob = await seedUser(db, { handle: castId<Handle>("bob") });
  const alicePersona = (await svc.create({ principal: principal(alice), input: { name: "Zara", description: "a cartographer" } })).id;
  const bobPersona = (await svc.create({ principal: principal(bob), input: { name: "Mira", description: "a smith" } })).id;
  const room = (await seedChat(db)).id;
  return { db, room, resolve: createResolvePersonasForParticipants(harness.ctx), alice, bob, alicePersona, bobPersona };
}

describe("resolvePersonasForParticipants", () => {
  test("resolves every requested persona whose OWNER is in the consent set — across owners, in one read", async () => {
    const { resolve, room, alice, bob, alicePersona, bobPersona } = await seedTwoOwners();

    const map = await resolve({ chatId: room, personaIds: [alicePersona, bobPersona], allowedOwnerIds: [alice, bob] });

    // The presentation surface both `{{user}}` (name) and `{{persona}}` (description) render from.
    expect(map.get(alicePersona)?.name).toBe("Zara");
    expect(map.get(alicePersona)?.description).toBe("a cartographer");
    expect(map.get(alicePersona)?.ownerId).toBe(alice);
    expect(map.get(bobPersona)?.name).toBe("Mira");
  });

  test("REFUSAL: a persona whose owner is NOT in the consent set is absent (a departed/never-member's seat)", async () => {
    const { resolve, room, alice, alicePersona, bobPersona } = await seedTwoOwners();

    // Bob left the room (or was never in it): only Alice consents, so only Alice's persona resolves.
    const map = await resolve({ chatId: room, personaIds: [alicePersona, bobPersona], allowedOwnerIds: [alice] });

    expect(map.has(alicePersona)).toBe(true);
    expect(map.has(bobPersona)).toBe(false);
    expect(map.size).toBe(1);
  });

  test("the room's pin resolves after its owner leaves; no other departed owner's persona rides along", async () => {
    const { db, resolve, alice, alicePersona, bobPersona } = await seedTwoOwners();
    const pinnedToBob = (await seedChat(db, { anchorPersonaId: bobPersona })).id;
    const pinnedToAlice = (await seedChat(db, { anchorPersonaId: alicePersona })).id;

    const map = await resolve({ chatId: pinnedToBob, personaIds: [alicePersona, bobPersona], allowedOwnerIds: [alice] });
    expect(map.get(bobPersona)?.name).toBe("Mira");

    const unpinned = await resolve({ chatId: pinnedToAlice, personaIds: [alicePersona, bobPersona], allowedOwnerIds: [alice] });
    expect(unpinned.has(bobPersona)).toBe(false);
  });

  test("REFUSAL: only the room's own pin passes the consent gate; another room's pin, another owner's included, never does", async () => {
    const { db, resolve, alicePersona, bobPersona } = await seedTwoOwners();
    // Nobody is present in either room, so the pin is the only way in. Each room names the other's pinned
    // persona among its ids, and neither gets it.
    const pinnedToAlice = (await seedChat(db, { anchorPersonaId: alicePersona })).id;
    const pinnedToBob = (await seedChat(db, { anchorPersonaId: bobPersona })).id;

    const aliceRoom = await resolve({ chatId: pinnedToAlice, personaIds: [alicePersona, bobPersona], allowedOwnerIds: [] });
    expect([...aliceRoom.keys()]).toEqual([alicePersona]);

    const bobRoom = await resolve({ chatId: pinnedToBob, personaIds: [alicePersona, bobPersona], allowedOwnerIds: [] });
    expect([...bobRoom.keys()]).toEqual([bobPersona]);
  });

  test("REFUSAL: an EMPTY consent set in an unpinned room resolves nothing, even for ids that exist", async () => {
    const { resolve, room, alicePersona, bobPersona } = await seedTwoOwners();

    const map = await resolve({ chatId: room, personaIds: [alicePersona, bobPersona], allowedOwnerIds: [] });

    expect(map.size).toBe(0);
  });

  test("a MISSING id is simply absent — indistinguishable from a foreign one (no existence oracle)", async () => {
    const { resolve, room, alice } = await seedTwoOwners();

    const map = await resolve({ chatId: room, personaIds: [castId<PersonaId>("persona_gone")], allowedOwnerIds: [alice] });

    expect(map.size).toBe(0);
  });

  test("no ids in an unpinned room ⇒ an empty map", async () => {
    const { resolve, room, alice } = await seedTwoOwners();

    expect((await resolve({ chatId: room, personaIds: [], allowedOwnerIds: [alice] })).size).toBe(0);
  });

  test("duplicate ids/owners collapse — the room may hand the same persona twice (anchor == active)", async () => {
    const { resolve, room, alice, alicePersona } = await seedTwoOwners();

    const map = await resolve({ chatId: room, personaIds: [alicePersona, alicePersona], allowedOwnerIds: [alice, alice] });

    expect(map.size).toBe(1);
    expect(map.get(alicePersona)?.name).toBe("Zara");
  });
});
