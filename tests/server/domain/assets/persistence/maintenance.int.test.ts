// persistence: maintenance — the enumerate/delete/relink reads the maintenance verbs build on. Real libSQL.
//   • loadOwnerAssetRows — owner-scoped (id, hash) rows (the sweep partition).
//   • listAssetOwners — the distinct owner set (fsck's dangling pass drives off it).
//   • deleteAssetRow — the drop-row step (idempotent-ish single-row delete).
//   • batchLinkAvatars — the backfill relink, owner-scoped (a foreign character is NOT relinked).

import { assets, characters } from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import {
  batchLinkAvatars,
  deleteAssetRow,
  listAssetOwners,
  loadOwnerAssetRows,
} from "../../../../../packages/server/src/domain/assets/persistence/maintenance.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedCharacter, seedUser } from "../_support.ts";

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
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const a = await seedAssetRow(db, owner, "asset_a", "hash_a");
    await seedAssetRow(db, other, "asset_b", "hash_b");

    const rows = await loadOwnerAssetRows(db, owner);

    expect(rows).toEqual([{ id: a, hash: "hash_a" }]);
  });

  test("listAssetOwners returns the distinct owners with rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    await seedAssetRow(db, owner, "asset_a", "hash_a");
    await seedAssetRow(db, owner, "asset_a2", "hash_a2");
    await seedAssetRow(db, other, "asset_b", "hash_b");

    const owners = await listAssetOwners(db);

    expect([...owners].sort()).toEqual([other, owner].sort());
  });

  test("deleteAssetRow removes exactly the named row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const a = await seedAssetRow(db, owner, "asset_a", "hash_a");
    const b = await seedAssetRow(db, owner, "asset_b", "hash_b");

    await deleteAssetRow(db, a);

    const remaining = await db.select({ id: assets.id }).from(assets);
    expect(remaining).toEqual([{ id: b }]);
  });

  test("batchLinkAvatars sets avatarAssetId owner-scoped (skips a foreign character)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    // A real stored asset (the FK target) + one owned, one foreign character.
    const stored = await createAssetsService(h.ctx).store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "avatar",
      mime: PNG,
    });
    const mine = await seedCharacter(db, owner, { handle: "mine" });
    const theirs = await seedCharacter(db, other, { handle: "theirs" });

    await batchLinkAvatars(db, owner, [
      { characterId: mine, assetId: stored.assetId },
      { characterId: theirs, assetId: stored.assetId },
    ]);

    const mineRow = await db.select({ avatar: characters.avatarAssetId }).from(characters).where(eq(characters.id, mine));
    const theirsRow = await db.select({ avatar: characters.avatarAssetId }).from(characters).where(eq(characters.id, theirs));
    expect(mineRow[0]?.avatar).toBe(stored.assetId);
    // The owner-scoped WHERE means the foreign character is NOT relinked (never cross-owner).
    expect(theirsRow[0]?.avatar).toBeNull();
  });
});
