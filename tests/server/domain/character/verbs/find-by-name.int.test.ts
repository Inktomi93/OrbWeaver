// verb: findByName — the import re-link by display name. Pins that the match is the name the user sees
// (not the handle), owner-scoped, blind to synthetic group identities, and returns every same-named card so
// the caller can refuse an ambiguity.

import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { FROZEN_AT_MS as FROZEN_AT } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedRawCharacter, seedUser } from "../_support.ts";

describe("findByName", () => {
  test("resolves a character whose handle differs from its display name", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const elias = await seedRawCharacter(db, { id: "character_elias", ownerId: owner, handle: castId<CharacterHandle>("elias"), name: "Elias Thorn" });

    expect(await svc.findByName({ ownerId: owner, name: "Elias Thorn" })).toEqual([{ characterId: elias }]);
    expect(await svc.findByName({ ownerId: owner, name: "elias" })).toEqual([]);
  });

  test("returns every same-named character, oldest first, and skips other owners and synthetic identities", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const newer = await seedRawCharacter(db, { id: "character_newer", ownerId: owner, name: "Elias Thorn", createdAt: FROZEN_AT + 1 });
    const older = await seedRawCharacter(db, { id: "character_older", ownerId: owner, name: "Elias Thorn", createdAt: FROZEN_AT });
    await seedRawCharacter(db, { id: "character_foreign", ownerId: other, name: "Elias Thorn" });
    await seedRawCharacter(db, { id: "character_group", ownerId: owner, name: "Elias Thorn", synthetic: true });

    expect(await svc.findByName({ ownerId: owner, name: "Elias Thorn" })).toEqual([{ characterId: older }, { characterId: newer }]);
    expect(await svc.findByName({ ownerId: owner, name: "ELIAS THORN" })).toEqual([]);
    expect(await svc.findByName({ ownerId: owner, name: "ELIAS THORN", caseInsensitive: true })).toEqual([{ characterId: older }, { characterId: newer }]);
  });
});
