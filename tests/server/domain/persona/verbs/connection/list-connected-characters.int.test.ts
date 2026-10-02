// verb: listConnectedCharacters — persona-scoped, owner-gated junction read (the persona-side twin of
// listConnectedToCharacter, #866 S4). Load-bearing: returns only characters connected to THIS persona
// (not the owner's other characters), as summary views; a foreign persona throws.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedCharacter, seedUser } from "../../_support.ts";

describe("listConnectedCharacters", () => {
  test("returns only the characters connected to this persona, as summary views", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const connectedA = await seedCharacter(db, { ownerId: owner, id: "character_linked_a", name: "Aria" });
    const connectedB = await seedCharacter(db, { ownerId: owner, id: "character_linked_b", name: "Bryn" });
    // The exclusion control: an owned character with NO junction row must not appear.
    await seedCharacter(db, { ownerId: owner, id: "character_unlinked", name: "Unlinked" });

    const persona = await svc.create({
      principal: principal(owner),
      input: { name: "Me", description: "" },
    });
    await svc.connectToCharacter({ principal: principal(owner), characterId: connectedA, personaId: persona.id });
    await svc.connectToCharacter({ principal: principal(owner), characterId: connectedB, personaId: persona.id });

    const connected = await svc.listConnectedCharacters({ principal: principal(owner), personaId: persona.id });
    expect(connected.map((c) => c.id).toSorted()).toEqual([connectedA, connectedB].toSorted());
    // Summary view: every row carries a NAME (the display column), and nothing leaked the exclusion row.
    expect(connected).toHaveLength(2);
    for (const row of connected) {
      expect(row.name.length).toBeGreaterThan(0);
    }
  });

  test("a persona owned by another user is rejected", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreignPersona = await svc.create({
      principal: principal(other),
      input: { name: "Not yours", description: "" },
    });
    await expect(svc.listConnectedCharacters({ principal: principal(owner), personaId: foreignPersona.id })).rejects.toThrow(DomainNotFoundError);
  });
});
