// op: resolvePersonasForRoster — the PRINCIPAL-LESS room-plane read (the multi-human resolution widening).
// Load-bearing: the ONLY gate is `allowedOwnerIds` (the room's PRESENT humans), it lives in the WHERE, and a
// persona outside it is ABSENT rather than refused — the same no-existence-oracle answer `get` gives, so the
// widening can never become an unscoped persona read. The REFUSAL arms are the point of this file: an op that
// resolved by id alone would hand any room any persona in the database.

import type { PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService, createResolvePersonasForRoster } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** A room of two humans, each with one persona. Returns the op under test plus the ids. */
async function seedTwoOwners(): Promise<{
  readonly resolve: ReturnType<typeof createResolvePersonasForRoster>;
  readonly alice: UserId;
  readonly bob: UserId;
  readonly alicePersona: PersonaId;
  readonly bobPersona: PersonaId;
}> {
  const db = await freshDb();
  const harness = makeHarness(db);
  const svc = createPersonaService(harness.ctx);
  const alice = await seedUser(db, { handle: "alice" });
  const bob = await seedUser(db, { handle: "bob" });
  const alicePersona = (await svc.create({ principal: principal(alice), input: { name: "Zara", description: "a cartographer" } })).id;
  const bobPersona = (await svc.create({ principal: principal(bob), input: { name: "Mara", description: "a smith" } })).id;
  return { resolve: createResolvePersonasForRoster(harness.ctx), alice, bob, alicePersona, bobPersona };
}

describe("resolvePersonasForRoster", () => {
  test("resolves every requested persona whose OWNER is in the consent set — across owners, in one read", async () => {
    const { resolve, alice, bob, alicePersona, bobPersona } = await seedTwoOwners();

    const map = await resolve({ personaIds: [alicePersona, bobPersona], allowedOwnerIds: [alice, bob] });

    // The presentation surface both `{{user}}` (name) and `{{persona}}` (description) render from.
    expect(map.get(alicePersona)?.name).toBe("Zara");
    expect(map.get(alicePersona)?.description).toBe("a cartographer");
    expect(map.get(alicePersona)?.ownerId).toBe(alice);
    expect(map.get(bobPersona)?.name).toBe("Mara");
  });

  test("REFUSAL: a persona whose owner is NOT in the consent set is absent (a departed/never-member's pin)", async () => {
    const { resolve, alice, alicePersona, bobPersona } = await seedTwoOwners();

    // Bob left the room (or was never in it): only Alice consents, so only Alice's persona resolves.
    const map = await resolve({ personaIds: [alicePersona, bobPersona], allowedOwnerIds: [alice] });

    expect(map.has(alicePersona)).toBe(true);
    expect(map.has(bobPersona)).toBe(false);
    expect(map.size).toBe(1);
  });

  test("REFUSAL: an EMPTY consent set resolves nothing, even for ids that exist (fail-closed, no read)", async () => {
    const { resolve, alicePersona, bobPersona } = await seedTwoOwners();

    const map = await resolve({ personaIds: [alicePersona, bobPersona], allowedOwnerIds: [] });

    expect(map.size).toBe(0);
  });

  test("a MISSING id is simply absent — indistinguishable from a foreign one (no existence oracle)", async () => {
    const { resolve, alice } = await seedTwoOwners();

    const map = await resolve({ personaIds: [castId<PersonaId>("persona_gone")], allowedOwnerIds: [alice] });

    expect(map.size).toBe(0);
  });

  test("no ids ⇒ an empty map (the no-persona room, no query)", async () => {
    const { resolve, alice } = await seedTwoOwners();

    expect((await resolve({ personaIds: [], allowedOwnerIds: [alice] })).size).toBe(0);
  });

  test("duplicate ids/owners collapse — the room may hand the same persona twice (anchor == active)", async () => {
    const { resolve, alice, alicePersona } = await seedTwoOwners();

    const map = await resolve({ personaIds: [alicePersona, alicePersona], allowedOwnerIds: [alice, alice] });

    expect(map.size).toBe(1);
    expect(map.get(alicePersona)?.name).toBe("Zara");
  });
});
