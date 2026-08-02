// .int tests for schema/persona (D23 — single-owned, `ownerId` KEPT). Real libSQL :memory: via freshDb
// (FK PRAGMA ON). Covers: insert→select round-trip (branded id survives), the typed-metadata JSON
// round-trip through the @orb/db/kit read-seam parser, the FK-on-owner enforcement, and the
// avatar SET NULL on asset delete.

import type { PersonaMetadata } from "@orb/contracts/persona";
import { assets, personas } from "@orb/db";
import { isConstraintViolation, parseRecord } from "@orb/db/kit";
import type { AssetId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
// The user factory replaces the hand-rolled seedOwner (support/factories — the one seeding home).
import { seedUser } from "../../support/factories/index.ts";
import { expect, test } from "../../support/fixtures";

test("personas insert→select round-trips (branded id survives, metadata JSON parses)", async () => {
  const db = await freshDb();
  const { id: ownerId } = await seedUser(db);
  const id = castId<PersonaId>("persona_roundtrip");
  const metadata: PersonaMetadata = { descriptionPosition: "in_prompt" };

  await db.insert(personas).values({
    id,
    ownerId,
    name: "Aria",
    description: "A calm, curious narrator.",
    metadata,
  });

  const rows = await db.select().from(personas).where(eq(personas.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.ownerId).toBe(ownerId);
  expect(rows[0]?.name).toBe("Aria");
  // JSON round-trip through the @orb/db/kit read-seam parser.
  expect(parseRecord(rows[0]?.metadata)).toEqual(metadata);
});

test("owner_id FK is enforced (insert against a missing user fails)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(personas).values({
      id: castId<PersonaId>("persona_orphan"),
      ownerId: castId<UserId>("user_does_not_exist"),
      name: "Ghost",
      description: "",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("avatar_asset_id is SET NULL when its asset is deleted (persona survives)", async () => {
  const db = await freshDb();
  const { id: ownerId } = await seedUser(db);
  const assetId = castId<AssetId>("asset_persona_avatar");
  await db.insert(assets).values({
    id: assetId,
    ownerId,
    kind: "avatar",
    mime: "image/webp",
    size: 1,
    hash: "e".repeat(64),
  });
  const id = castId<PersonaId>("persona_with_avatar");
  await db.insert(personas).values({
    id,
    ownerId,
    name: "Pic",
    description: "",
    avatarAssetId: assetId,
  });

  await db.delete(assets).where(eq(assets.id, assetId));

  const rows = await db.select().from(personas).where(eq(personas.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.avatarAssetId).toBeNull();
});
