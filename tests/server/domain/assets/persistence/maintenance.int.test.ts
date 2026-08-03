// persistence: maintenance — the enumerate/delete/relink reads the maintenance verbs build on. Real libSQL.
//   • loadOwnerAssetRows — owner-scoped (id, hash) rows (the sweep partition).
//   • listAssetOwners — the distinct owner set (fsck's dangling pass drives off it).
//   • deleteAssetRow — the drop-row step (idempotent-ish single-row delete).
//   • loadAvatarBackfillCandidates — the GATHER half of the avatar backfill, owner-scoped (the relink WRITE
//     is character's: `domain/character/persistence/avatar-link-write.ts`, tested beside it).

import { assets } from "@orb/db";
import type { AssetId, CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  deleteAssetRow,
  listAssetOwners,
  loadAvatarBackfillCandidates,
  loadOwnerAssetRows,
} from "../../../../../packages/server/src/domain/assets/persistence/maintenance.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedUser } from "../_support.ts";

const PNG = "image/png";

async function seedAssetRow(db: Awaited<ReturnType<typeof freshDb>>, owner: string, raw: string, hash: string): Promise<AssetId> {
  const id = castId<AssetId>(raw);
  await db.insert(assets).values({
    id,
    ownerId: castId(owner),
    kind: "avatar",
    mime: PNG,
    size: 8,
    hash,
    uploadedAt: FROZEN_AT_MS,
  });
  return id;
}

describe("assets maintenance persistence", () => {
  test("loadOwnerAssetRows returns only the owner's (id, hash) rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const a = await seedAssetRow(db, owner, "asset_a", "hash_a");
    await seedAssetRow(db, other, "asset_b", "hash_b");

    const rows = await loadOwnerAssetRows(db, owner);

    expect(rows).toEqual([{ id: a, hash: "hash_a" }]);
  });

  test("listAssetOwners returns the distinct owners with rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    await seedAssetRow(db, owner, "asset_a", "hash_a");
    await seedAssetRow(db, owner, "asset_a2", "hash_a2");
    await seedAssetRow(db, other, "asset_b", "hash_b");

    const owners = await listAssetOwners(db);

    expect([...owners].sort()).toEqual([other, owner].sort());
  });

  test("deleteAssetRow removes exactly the named row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedAssetRow(db, owner, "asset_a", "hash_a");
    const b = await seedAssetRow(db, owner, "asset_b", "hash_b");

    await deleteAssetRow(db, a);

    const remaining = await db.select({ id: assets.id }).from(assets);
    expect(remaining).toEqual([{ id: b }]);
  });

  test("loadAvatarBackfillCandidates is owner-scoped and stages only unlinked recorded cards", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const staged = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("staged"), importHash: "hash_staged" });
    // Excluded: no recorded importHash (nothing to re-extract) and a foreign owner's staged card.
    await seedCharacter(db, owner, { handle: castId<CharacterHandle>("unstaged") });
    await seedCharacter(db, other, { handle: castId<CharacterHandle>("foreign"), importHash: "hash_foreign" });

    const rows = await loadAvatarBackfillCandidates(db, owner);

    expect(rows).toEqual([{ id: staged, ownerId: owner, importHash: "hash_staged" }]);
  });
});
