// verb: attachImportedArt — the JSON-then-PNG exception of the import identity. A no-art row takes the art
// once and re-keys to the with-art hash, keeping the art-less hash as a second key; a row that already has
// art, another owner's row, and a foreign asset all leave the row untouched, with no audit and no emit.

import type { Db } from "@orb/db";
import { characters } from "@orb/db";
import type { AssetId, CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { AssetNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedAsset, seedRawCharacter, seedUser } from "../_support.ts";

const TEXT_HASH = "a".repeat(64);
const ART_HASH = "b".repeat(64);

async function storedRow(
  db: Db,
  id: CharacterId,
): Promise<{ readonly avatarAssetId: AssetId | null; readonly importHash: string | null; readonly importTextHash: string | null }> {
  const rows = await db
    .select({ avatarAssetId: characters.avatarAssetId, importHash: characters.importHash, importTextHash: characters.importTextHash })
    .from(characters)
    .where(eq(characters.id, id));
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`character ${id} is missing`);
  }
  return row;
}

describe("attachImportedArt", () => {
  test("gives a no-art row the art, re-keys its import identity, audits and announces the change", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const art = await seedAsset(db, { ownerId: owner });
    const characterId = await seedRawCharacter(db, { ownerId: owner, importHash: TEXT_HASH });

    expect(await svc.attachImportedArt({ ownerId: owner, characterId, avatarAssetId: art, importHash: ART_HASH })).toBe(true);

    expect(await storedRow(db, characterId)).toEqual({ avatarAssetId: art, importHash: ART_HASH, importTextHash: TEXT_HASH });
    expect(await svc.findByImportHash({ ownerId: owner, importHash: ART_HASH })).toEqual({ characterId });
    // The JSON card the row landed from still finds it, so importing that JSON again is not a duplicate (D290).
    expect(await svc.findByImportHash({ ownerId: owner, importHash: TEXT_HASH })).toEqual({ characterId });
    expect(harness.audits).toEqual([
      {
        entry: {
          actorUserId: owner,
          action: "character.attachImportedArt",
          entityType: "character",
          entityId: characterId,
          metadata: { avatarAssetId: art },
        },
        at: FROZEN_AT_MS,
      },
    ]);
    expect(harness.userEvents).toEqual([{ userId: owner, event: { type: "charactersChanged", characterId } }]);
  });

  test("leaves a row that already has art alone: that card is an alt-art version, a separate character", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const existing = await seedAsset(db, { id: "asset_existing", ownerId: owner, hash: "hash_existing" });
    const incoming = await seedAsset(db, { id: "asset_incoming", ownerId: owner, hash: "hash_incoming" });
    const characterId = await seedRawCharacter(db, { ownerId: owner, importHash: TEXT_HASH, avatarAssetId: existing });

    expect(await svc.attachImportedArt({ ownerId: owner, characterId, avatarAssetId: incoming, importHash: ART_HASH })).toBe(false);

    expect(await storedRow(db, characterId)).toEqual({ avatarAssetId: existing, importHash: TEXT_HASH, importTextHash: null });
    expect(harness.audits).toEqual([]);
    expect(harness.userEvents).toEqual([]);
  });

  test("is owner-scoped: another owner's no-art row never takes the caller's art", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const caller = await seedUser(db, { handle: castId<Handle>("caller") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const art = await seedAsset(db, { ownerId: caller });
    const foreignRow = await seedRawCharacter(db, { ownerId: other, importHash: TEXT_HASH });

    expect(await svc.attachImportedArt({ ownerId: caller, characterId: foreignRow, avatarAssetId: art, importHash: ART_HASH })).toBe(false);

    expect(await storedRow(db, foreignRow)).toEqual({ avatarAssetId: null, importHash: TEXT_HASH, importTextHash: null });
    expect(harness.audits).toEqual([]);
    expect(harness.userEvents).toEqual([]);
  });

  test("refuses an asset the caller does not own before any write", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreignArt = await seedAsset(db, { ownerId: other });
    const characterId = await seedRawCharacter(db, { ownerId: owner, importHash: TEXT_HASH });

    await expect(svc.attachImportedArt({ ownerId: owner, characterId, avatarAssetId: foreignArt, importHash: ART_HASH })).rejects.toBeInstanceOf(
      AssetNotFoundError,
    );

    expect(await storedRow(db, characterId)).toEqual({ avatarAssetId: null, importHash: TEXT_HASH, importTextHash: null });
    expect(harness.audits).toEqual([]);
    expect(harness.userEvents).toEqual([]);
  });
});
