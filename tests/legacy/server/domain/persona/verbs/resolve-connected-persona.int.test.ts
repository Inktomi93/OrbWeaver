// op: resolveConnectedPersona — a solo-character founding auto-anchors the founder's ONE persona connected to that
// character. Ambiguity (two connections), a group founding, and another user's connection all answer null, so the
// room falls through to the default seed instead of guessing.

import { databaseHandle } from "@orb/db/wiring-driver";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createPersonaService, createResolveConnectedPersona } from "#server/domain/persona/index.ts";
import { makeHarness, principal, seedCharacter, seedUser } from "../_support.ts";

describe("resolveConnectedPersona", () => {
  test("exactly one owned connection anchors; a second connection, a group or a foreign founder answers null", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const solo = await seedCharacter(db, { ownerId: owner, id: "character_solo" });
    const twice = await seedCharacter(db, { ownerId: owner, id: "character_twice" });
    const first = await svc.create({ principal: await principal(db, owner), input: { name: "First", description: "d" } });
    const second = await svc.create({ principal: await principal(db, owner), input: { name: "Second", description: "d" } });
    await svc.connectToCharacter({ principal: await principal(db, owner), characterId: solo, personaId: first.id });
    await svc.connectToCharacter({ principal: await principal(db, owner), characterId: twice, personaId: first.id });
    await svc.connectToCharacter({ principal: await principal(db, owner), characterId: twice, personaId: second.id });
    const resolve = createResolveConnectedPersona({ db: databaseHandle(db) });

    expect(await resolve(owner, [solo])).toBe(first.id);
    expect(await resolve(owner, [twice])).toBeNull();
    expect(await resolve(owner, [solo, twice])).toBeNull();
    expect(await resolve(other, [solo])).toBeNull();
    expect(await resolve(owner, [])).toBeNull();
  });
});
