// .int tests for schema/assets (D21 — per-user CAS index). Real libSQL :memory: via freshDb (FK PRAGMA
// ON). Covers: insert→select round-trip (branded id survives), the `unique(owner_id, hash)` composite,
// the FK-on-owner enforcement, the `kind` CHECK, and the test-mirror (db enum members === ASSET_KINDS).

import { ASSET_KINDS } from "@orb/contracts/assets";
import { assets } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedUser } from "./_support.ts";

test("assets insert→select round-trips (branded id survives, kind/hash stored)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_assets_a", handle: "asset-owner-a" });
  const id = castId<AssetId>("asset_roundtrip");
  await db.insert(assets).values({
    id,
    ownerId,
    kind: "avatar",
    mime: "image/webp",
    size: 1234,
    hash: "a".repeat(64),
  });

  const rows = await db.select().from(assets).where(eq(assets.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.ownerId).toBe(ownerId);
  expect(rows[0]?.kind).toBe("avatar");
  expect(rows[0]?.hash).toBe("a".repeat(64));
});

test("unique(owner_id, hash) is per-user: same hash collides within owner, coexists across owners", async () => {
  const db = await freshDb();
  const ownerA = await seedUser(db, { id: "user_assets_b", handle: "asset-owner-b" });
  const ownerB = await seedUser(db, { id: "user_assets_c", handle: "asset-owner-c" });
  const hash = "b".repeat(64);

  await db.insert(assets).values({
    id: castId<AssetId>("asset_a1"),
    ownerId: ownerA,
    kind: "card",
    mime: "image/png",
    size: 10,
    hash,
  });
  // A DIFFERENT owner with the SAME hash is allowed (within-user dedup only).
  await db.insert(assets).values({
    id: castId<AssetId>("asset_b1"),
    ownerId: ownerB,
    kind: "card",
    mime: "image/png",
    size: 10,
    hash,
  });

  let caught: unknown;
  try {
    // The SAME (owner, hash) collides.
    await db.insert(assets).values({
      id: castId<AssetId>("asset_a2"),
      ownerId: ownerA,
      kind: "card",
      mime: "image/png",
      size: 10,
      hash,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("owner_id FK is enforced (insert against a missing user fails)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(assets).values({
      id: castId<AssetId>("asset_orphan"),
      ownerId: castId<UserId>("user_does_not_exist"),
      kind: "card",
      mime: "image/png",
      size: 1,
      hash: "c".repeat(64),
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("the kind CHECK rejects an off-tuple value", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_assets_d", handle: "asset-owner-d" });
  let caught: unknown;
  try {
    await db.insert(assets).values({
      id: castId<AssetId>("asset_badkind"),
      ownerId,
      // Force an off-tuple value past the TS enum to exercise the SQL CHECK.
      kind: "totally-bogus" as (typeof ASSET_KINDS)[number],
      mime: "image/png",
      size: 1,
      hash: "d".repeat(64),
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

test("test-mirror: assets.kind db enum members === ASSET_KINDS tuple", () => {
  expect([...assets.kind.enumValues]).toEqual([...ASSET_KINDS]);
});
