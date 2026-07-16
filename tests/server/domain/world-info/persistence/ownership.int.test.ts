// persistence/ownership — the attachment-target ownership gates. Load-bearing: they PASS for the owner and
// throw `WorldInfoNotFoundError` for a foreign OR absent target (no existence oracle — "not yours" and
// "doesn't exist" are one answer), reading the `characters`/`personas` schema directly (the sanctioned
// cross-table read). Internal files are imported by RELATIVE path.

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { WorldInfoNotFoundError } from "../../../../../packages/server/src/domain/world-info/contract/errors.ts";
import { ensureCharacterOwned, ensurePersonaOwned } from "../../../../../packages/server/src/domain/world-info/persistence/ownership.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedPersona, seedUser } from "../_support.ts";

describe("ensureCharacterOwned", () => {
  test("passes for the owner, throws for foreign + absent", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const mine = await seedCharacter(db, { ownerId: owner, id: "character_mine" });
    const theirs = await seedCharacter(db, { ownerId: other, id: "character_theirs" });

    await expect(ensureCharacterOwned(db, owner, mine)).resolves.toBeUndefined();
    await expect(ensureCharacterOwned(db, owner, theirs)).rejects.toBeInstanceOf(WorldInfoNotFoundError);
    await expect(ensureCharacterOwned(db, owner, castId<CharacterId>("character_ghost"))).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});

describe("ensurePersonaOwned", () => {
  test("passes for the owner, throws for foreign + absent", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const mine = await seedPersona(db, { ownerId: owner, id: "persona_mine" });
    const theirs = await seedPersona(db, { ownerId: other, id: "persona_theirs" });

    await expect(ensurePersonaOwned(db, owner, mine)).resolves.toBeUndefined();
    await expect(ensurePersonaOwned(db, owner, theirs)).rejects.toBeInstanceOf(WorldInfoNotFoundError);
    await expect(ensurePersonaOwned(db, owner, castId<PersonaId>("persona_ghost"))).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
