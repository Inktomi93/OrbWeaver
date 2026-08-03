// persistence/ownership — the attachment-TARGET gates. Both sides of an attach must be the caller's; this
// file is the target side. Load-bearing: a foreign target and an ABSENT target collapse to the same
// `RegexNotFoundError`, so the gate is never an existence oracle for someone else's library.

import type { CharacterId, Handle, PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { ensureCharacterOwned, ensurePresetOwned } from "../../../../../packages/server/src/domain/regex/persistence/ownership.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedPreset, seedUser } from "../_support.ts";

describe("regex ownership gates", () => {
  test("ensureCharacterOwned passes for the owner, refuses a stranger and an absent id identically", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const characterId = await seedCharacter(db, owner);

    await expect(ensureCharacterOwned(db, owner, characterId)).resolves.toBeUndefined();
    await expect(ensureCharacterOwned(db, stranger, characterId)).rejects.toBeInstanceOf(RegexNotFoundError);
    await expect(ensureCharacterOwned(db, owner, castId<CharacterId>("character_absent"))).rejects.toBeInstanceOf(RegexNotFoundError);
  });

  test("ensurePresetOwned passes for the owner and refuses a stranger", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const presetId = await seedPreset(db, owner);

    await expect(ensurePresetOwned(db, owner, presetId)).resolves.toBeUndefined();
    await expect(ensurePresetOwned(db, stranger, presetId)).rejects.toBeInstanceOf(RegexNotFoundError);
  });

  test("the NULL-owner system preset is un-attachable by construction", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const systemPreset = await seedPreset(db, null, "system");

    // A null ownerId matches no caller — the same equality check that gates a foreign preset is what makes
    // the shared default read-only. That is a property of the data, not a special case in the gate.
    await expect(ensurePresetOwned(db, owner, systemPreset)).rejects.toBeInstanceOf(RegexNotFoundError);
    await expect(ensurePresetOwned(db, owner, castId<PresetId>("preset_absent"))).rejects.toBeInstanceOf(RegexNotFoundError);
  });
});
