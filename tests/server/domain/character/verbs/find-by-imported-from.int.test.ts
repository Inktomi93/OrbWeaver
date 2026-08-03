// verb: findByImportedFrom — the batched provenance oracle behind the hub search page's already-imported
// markers. Load-bearing: it returns one match per FOUND `importedFrom` value (absent values omitted), the
// lookup is OWNER-SCOPED (a different owner's same-provenance card is NOT returned), and an empty `values`
// short-circuits to `[]` (never a bare `IN ()`).

import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, seedRawCharacter, seedUser } from "../_support.ts";

describe("findByImportedFrom", () => {
  test("maps each found importedFrom value to its characterId; absent values are omitted", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const seraphina = await seedRawCharacter(db, {
      id: "character_seraphina",
      ownerId: owner,
      handle: castId<CharacterHandle>("seraphina"),
      importedFrom: "hub:chub:Anon/seraphina",
      importHash: "a".repeat(64),
    });
    await seedRawCharacter(db, {
      id: "character_local",
      ownerId: owner,
      handle: castId<CharacterHandle>("local"),
      importedFrom: null, // an app-authored card carries no provenance
      importHash: null,
    });

    const matches = await svc.findByImportedFrom({
      ownerId: owner,
      values: ["hub:chub:Anon/seraphina", "hub:chub:Anon/not-imported"],
    });
    expect(matches).toEqual([{ importedFrom: "hub:chub:Anon/seraphina", characterId: seraphina }]);
  });

  test("is owner-scoped — a different owner's same-provenance card is not returned", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const a = await seedUser(db, { handle: castId<Handle>("a") });
    const b = await seedUser(db, { handle: castId<Handle>("b") });
    await seedRawCharacter(db, {
      id: "character_b",
      ownerId: b,
      handle: castId<CharacterHandle>("seraphina"),
      importedFrom: "hub:chub:Anon/seraphina",
      importHash: "b".repeat(64),
    });

    const matches = await svc.findByImportedFrom({ ownerId: a, values: ["hub:chub:Anon/seraphina"] });
    expect(matches).toEqual([]);
  });

  test("empty values short-circuits to []", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    expect(await svc.findByImportedFrom({ ownerId: owner, values: [] })).toEqual([]);
  });
});
