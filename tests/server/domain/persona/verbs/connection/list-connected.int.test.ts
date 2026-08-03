// verb: listConnectedToCharacter — character-scoped, owner-gated read. Load-bearing: returns only personas
// connected to THIS character (not the owner's other personas), newest first; a foreign character throws.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedUser } from "../../_support.ts";

const ONE_MINUTE = 60_000;

describe("listConnectedToCharacter", () => {
  test("returns connected personas newest-first, excluding unconnected ones", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });

    const a = await svc.create({
      principal: principal(owner),
      input: { name: "A", description: "" },
    });
    h.advance(ONE_MINUTE);
    const b = await svc.create({
      principal: principal(owner),
      input: { name: "B", description: "" },
    });
    await svc.create({
      principal: principal(owner),
      input: { name: "Unconnected", description: "" },
    });

    await svc.connectToCharacter({
      principal: principal(owner),
      characterId: character,
      personaId: a.id,
    });
    await svc.connectToCharacter({
      principal: principal(owner),
      characterId: character,
      personaId: b.id,
    });

    const connected = await svc.listConnectedToCharacter({
      principal: principal(owner),
      characterId: character,
    });
    expect(connected.map((p) => p.name)).toEqual(["B", "A"]);
  });

  test("a character owned by another user is rejected", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreignCharacter = await seedCharacter(db, { ownerId: other });
    await expect(
      svc.listConnectedToCharacter({
        principal: principal(owner),
        characterId: foreignCharacter,
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });
});
