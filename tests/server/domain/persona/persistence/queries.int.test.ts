// persistence — the owner-scoped reads + the parse-at-the-seam detailOf. Load-bearing: the ownership
// predicate lives in the WHERE (a non-owner read returns undefined, never another user's row); the avatar
// LEFT JOIN surfaces the hash; detailOf degrades a CORRUPT metadata blob to null instead of poisoning the
// view (the read-seam zod .catch); ensureCharacterOwned/ensurePersonaOwned throw the right typed error.
// Internal (non-front-door) files are imported by RELATIVE path — the package `./*` map only resolves a
// module's directory front door, not a flat file.

import { personas } from "@orb/db";
import type { AssetId, CharacterId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { PersonaCharacterNotFoundError, PersonaNotFoundError } from "../../../../../packages/server/src/domain/persona/contract/errors.ts";
import {
  detailOf,
  ensureCharacterOwned,
  ensurePersonaOwned,
  loadOwnedPersonaWithAvatar,
  loadPersonasForOwners,
} from "../../../../../packages/server/src/domain/persona/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedAsset, seedCharacter, seedUser } from "../_support.ts";

const FROZEN_AT = 1_750_000_000_000;

async function seedPersonaRow(
  db: Awaited<ReturnType<typeof freshDb>>,
  ownerId: UserId,
  overrides: { id?: string; metadata?: unknown; avatarAssetId?: AssetId | null } = {},
): Promise<PersonaId> {
  const id = castId<PersonaId>(overrides.id ?? "persona_x");
  await db.insert(personas).values({
    id,
    ownerId,
    name: "P",
    description: "d",
    avatarAssetId: overrides.avatarAssetId ?? null,
    metadata: overrides.metadata as never,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

describe("owner-scoped persona load", () => {
  test("loads an owned row with the avatar hash joined", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const avatar = await seedAsset(db, { ownerId: owner, hash: "h" });
    const id = await seedPersonaRow(db, owner, { avatarAssetId: avatar });
    const row = await loadOwnedPersonaWithAvatar(db, owner, id);
    expect(row?.persona.id).toBe(id);
    expect(row?.avatar?.hash).toBe("h");
  });

  test("a non-owner read returns undefined (the WHERE-clause owner predicate)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const id = await seedPersonaRow(db, owner);
    expect(await loadOwnedPersonaWithAvatar(db, other, id)).toBeUndefined();
  });
});

describe("metadata read seam (detailOf)", () => {
  test("degrades a corrupt (non-object) metadata blob to null", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // Write a deliberately invalid metadata blob past drizzle's unchecked $type column.
    const id = await seedPersonaRow(db, owner, { metadata: "not-an-object" });
    const row = await loadOwnedPersonaWithAvatar(db, owner, id);
    if (row === undefined) {
      throw new Error("expected the seeded row to load");
    }
    expect(detailOf(row).metadata).toBeNull();
  });

  test("passes a valid metadata blob through typed", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = await seedPersonaRow(db, owner, { metadata: { descriptionPosition: "none" } });
    const row = await loadOwnedPersonaWithAvatar(db, owner, id);
    if (row === undefined) {
      throw new Error("expected the seeded row to load");
    }
    expect(detailOf(row).metadata?.descriptionPosition).toBe("none");
  });

  test("degrades malformed and wrong-prefix sourceCharacterId on both persona read paths", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const malformed = await seedPersonaRow(db, owner, {
      id: "persona_bad_source",
      metadata: { sourceCharacterId: "character_not-a-typeid" },
    });
    const wrongPrefix = await seedPersonaRow(db, owner, {
      id: "persona_wrong_source",
      metadata: { sourceCharacterId: mintTypeId(ID_PREFIX.chat) },
    });

    for (const id of [malformed, wrongPrefix]) {
      const row = await loadOwnedPersonaWithAvatar(db, owner, id);
      if (row === undefined) {
        throw new Error("expected the seeded row to load");
      }
      expect(detailOf(row).metadata).toBeNull();
    }

    const listed = await loadPersonasForOwners(db, [malformed, wrongPrefix], [owner]);
    expect(new Map(listed.map((persona) => [persona.id, persona.metadata]))).toEqual(
      new Map([
        [malformed, null],
        [wrongPrefix, null],
      ]),
    );
  });
});

describe("ownership gates", () => {
  test("ensurePersonaOwned throws for a foreign/missing persona, passes for the owner", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const id = await seedPersonaRow(db, owner);
    await expect(ensurePersonaOwned(db, other, id)).rejects.toThrow(PersonaNotFoundError);
    await expect(ensurePersonaOwned(db, owner, castId<PersonaId>("persona_ghost"))).rejects.toThrow(PersonaNotFoundError);
    await expect(ensurePersonaOwned(db, owner, id)).resolves.toBeUndefined();
  });

  test("ensureCharacterOwned throws for a foreign/missing character, passes for the owner", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const character = await seedCharacter(db, { ownerId: owner });
    await expect(ensureCharacterOwned(db, other, character)).rejects.toThrow(PersonaCharacterNotFoundError);
    await expect(ensureCharacterOwned(db, owner, castId<CharacterId>("character_ghost"))).rejects.toThrow(PersonaCharacterNotFoundError);
    await expect(ensureCharacterOwned(db, owner, character)).resolves.toBeUndefined();
  });
});
