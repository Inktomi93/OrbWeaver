// verb: disconnectFromCharacter — idempotent junction delete. Load-bearing: a real disconnect reports
// {disconnected:true} + audits; disconnecting an absent link reports {disconnected:false} + does NOT audit;
// both ownership gates fire.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedCharacter, seedUser } from "../../_support.ts";

describe("disconnectFromCharacter", () => {
  test("removes a real link (disconnected:true, audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });
    const persona = await svc.create({
      principal: principal(owner),
      input: { name: "P", description: "d" },
    });
    await svc.connectToCharacter({
      principal: principal(owner),
      characterId: character,
      personaId: persona.id,
    });

    const result = await svc.disconnectFromCharacter({
      principal: principal(owner),
      characterId: character,
      personaId: persona.id,
    });

    expect(result).toEqual({ disconnected: true });
    expect(h.audits.map((a) => a.entry.action)).toContain("persona.disconnectFromCharacter");
  });

  test("disconnecting an absent link is a no-op (disconnected:false, no audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner });
    const persona = await svc.create({
      principal: principal(owner),
      input: { name: "P", description: "d" },
    });

    const result = await svc.disconnectFromCharacter({
      principal: principal(owner),
      characterId: character,
      personaId: persona.id,
    });

    expect(result).toEqual({ disconnected: false });
    expect(h.audits.some((a) => a.entry.action === "persona.disconnectFromCharacter")).toBe(false);
  });

  test("a foreign character throws (the ownership gate fires before the delete)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreignCharacter = await seedCharacter(db, { ownerId: other });
    const persona = await svc.create({
      principal: principal(owner),
      input: { name: "P", description: "d" },
    });
    await expect(
      svc.disconnectFromCharacter({
        principal: principal(owner),
        characterId: foreignCharacter,
        personaId: persona.id,
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });
});
