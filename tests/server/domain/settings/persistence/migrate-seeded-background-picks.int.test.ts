// persistence/migrate-seeded-background-picks — the `kind:"seeded"` retirement's settings half (owner ask
// 2026-09-18, "the weird seeded backgrounds").
//
// WHY THE ROW CLASSES ARE THE TEST. A stored appearance pick carrying the retired kind can be exactly one of
// three things, and each has a different correct answer:
//   1. a slug the pack STILL ships (one of the ten character scene plates) → the user's own plate ASSET,
//   2. a slug the pack no longer ships (one of the four deleted landscape placeholders, or a plate from an
//      older install) → `none`,
//   3. not `seeded` at all → untouched, including the `asset` pick a user already made.
// The whole risk of the retirement is class 1 silently collapsing into class 2: the schema's own
// `.catch("none")` heals an unknown kind at every parse, so WITHOUT this pass nothing crashes — the user
// just quietly loses the plate they picked, and nothing anywhere reds.
//
// IT HAS TO READ RAW, WHICH IS ALSO WHY THE FIXTURES DO. Every parsed read has already collapsed `"seeded"`
// to `"none"` and stripped the now-unknown `backgroundSeededId`, so these rows are inserted as raw JSON
// (`DEFAULT_USER_SETTINGS` spread plus the two legacy keys) rather than through a parse that would erase the
// very state under test.

import type { UserSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS, parseUserSettings } from "@orb/contracts/settings";
import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { assets, userSettings } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { migrateSeededBackgroundPicks } from "../../../../../packages/server/src/domain/settings/persistence/migrate-seeded-background-picks.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1_750_000_000_000;
const SHIPPED_SLUG = "niko-bg";
const DELETED_SLUG = "misty-highlands";

/** The resolver the seeder injects: slug → this user's own plate asset, `null` for a slug the pack no longer
 *  ships. Faked as a pure map — the REAL lift (read the shipped bytes, `assets.store`) is the scene-plate
 *  seeder's own business and is pinned there. */
function resolver(plateAssetId: string): (slug: string) => Promise<ThemeBackground | null> {
  return (slug): Promise<ThemeBackground | null> =>
    Promise.resolve(
      slug === SHIPPED_SLUG
        ? canonicalBackgroundSource({
            kind: "asset",
            assetId: plateAssetId,
            assetHash: "hash_niko_plate",
            mime: "image/jpeg",
            externalUrl: "",
            provenanceUrl: "",
          })
        : null,
    );
}

/** Insert a `user_settings` row carrying the RAW legacy shape — `backgroundImageKind:"seeded"` plus the
 *  since-removed `backgroundSeededId` key, exactly as a pre-retirement box stored it. */
async function seedLegacyPick(db: Db, userId: UserId, slug: string): Promise<void> {
  await db.insert(userSettings).values({
    userId,
    schemaVersion: DEFAULT_USER_SETTINGS.schemaVersion,
    // @orb-waive no-test-fabrication(unknown): raw pre-retirement legacy shape — kind:"seeded" and
    // backgroundSeededId are retired from UserSettings, so only a double cast can write them into the
    // fixture; ends if the retired fields are ever re-admitted to the type.
    config: {
      ...DEFAULT_USER_SETTINGS,
      appearance: { ...DEFAULT_USER_SETTINGS.appearance, backgroundImageKind: "seeded", backgroundSeededId: slug },
    } as unknown as UserSettings,
    updatedAt: AT,
  });
}

async function readAppearance(db: Db, userId: UserId): Promise<Record<string, unknown>> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return (rows[0]?.config.appearance ?? {}) as Record<string, unknown>;
}

/** The plate asset the rewrite points at has to exist and be `kind:"background"` — the guarded write path
 *  (`writeUserConfig`'s ownership+kind predicate) refuses any other pin, which is precisely the guard this
 *  migration must satisfy rather than bypass. */
async function seedPlateAsset(db: Db, ownerId: UserId): Promise<string> {
  const id = mintTypeId(ID_PREFIX.asset);
  await db.insert(assets).values({ id, ownerId, kind: "background", mime: "image/jpeg", size: 1, hash: "hash_niko_plate", uploadedAt: AT });
  return id;
}

test("THE CONTROL — without this pass the schema alone silently loses the plate (the defect it exists for)", async () => {
  // The planted positive control, and the reason this migration is not decorative. A red-first proof is not
  // available the usual way: on the PRE-retirement tree `kind:"seeded"` was a legal member, so the defect
  // did not exist yet; it is created by the retirement itself. So the control is the un-migrated read — run
  // the exact fixture the classes below use, DON'T migrate it, and show what a parse answers.
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_control" });
  await seedLegacyPick(db, u, SHIPPED_SLUG);

  const raw = await readAppearance(db, u);
  expect(raw["backgroundImageKind"], "the stored row really does carry the retired kind").toBe("seeded");

  const parsed = parseUserSettings(
    (await db.select().from(userSettings).where(eq(userSettings.userId, u)).limit(1))[0]?.config,
    DEFAULT_USER_SETTINGS.schemaVersion,
  );
  // `.catch("none")` heals the unknown kind and zod strips the now-unknown slug key: no throw, no red
  // anywhere, and the user's chosen plate is simply gone. That is the whole failure mode.
  expect(parsed.appearance.backgroundImageKind).toBe("none");
  expect(Object.hasOwn(parsed.appearance, "backgroundSeededId")).toBe(false);
});

test("class 1 — a STILL-SHIPPED plate slug becomes that user's own asset pick, never a silent `none`", async () => {
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_keeps_plate" });
  const plateAssetId = await seedPlateAsset(db, u);
  await seedLegacyPick(db, u, SHIPPED_SLUG);

  expect(await migrateSeededBackgroundPicks(db, u, resolver(plateAssetId), AT + 1)).toBe(1);

  const appearance = await readAppearance(db, u);
  expect(appearance["backgroundImageKind"]).toBe("asset");
  expect(appearance["backgroundAssetId"]).toBe(plateAssetId);
  expect(appearance["backgroundAssetHash"]).toBe("hash_niko_plate");
  expect(appearance["backgroundAssetMime"]).toBe("image/jpeg");
});

test("class 2 — a DELETED placeholder slug clears to `none` and carries no asset reference", async () => {
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_dropped_plate" });
  const plateAssetId = await seedPlateAsset(db, u);
  await seedLegacyPick(db, u, DELETED_SLUG);

  expect(await migrateSeededBackgroundPicks(db, u, resolver(plateAssetId), AT + 1)).toBe(1);

  const appearance = await readAppearance(db, u);
  expect(appearance["backgroundImageKind"]).toBe("none");
  // Not merely "not the plate" — EMPTY. A cleared pick that kept an id would be a GC root for an asset the
  // user is not using, which is the smuggle `canonicalBackgroundSource` exists to close on the carried twin.
  expect(appearance["backgroundAssetId"]).toBe("");
  expect(appearance["backgroundAssetHash"]).toBe("");
});

test("class 3 — a row that never carried `seeded` is not read, let alone rewritten", async () => {
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_own_pick" });
  const own = await seedPlateAsset(db, u);
  await db.insert(userSettings).values({
    userId: u,
    schemaVersion: DEFAULT_USER_SETTINGS.schemaVersion,
    config: {
      ...DEFAULT_USER_SETTINGS,
      appearance: { ...DEFAULT_USER_SETTINGS.appearance, backgroundImageKind: "asset", backgroundAssetId: own, backgroundAssetHash: "hash_niko_plate" },
    },
    updatedAt: AT,
  });

  expect(await migrateSeededBackgroundPicks(db, u, resolver(own), AT + 1)).toBe(0);
  const appearance = await readAppearance(db, u);
  expect(appearance["backgroundAssetId"]).toBe(own);
});

test("it is idempotent by its own predicate — a second pass rewrites nothing", async () => {
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_twice" });
  const plateAssetId = await seedPlateAsset(db, u);
  await seedLegacyPick(db, u, SHIPPED_SLUG);

  expect(await migrateSeededBackgroundPicks(db, u, resolver(plateAssetId), AT + 1)).toBe(1);
  // No marker column decides this: the rewritten row's raw kind is no longer `"seeded"`, so the predicate
  // that selects it cannot match it again. A second source of truth could disagree with the data; this
  // cannot.
  expect(await migrateSeededBackgroundPicks(db, u, resolver(plateAssetId), AT + 2)).toBe(0);
});

test("the whole-corpus sweep (`ownerId === null`) reaches every user, and each resolves against their OWN plate", async () => {
  const db = await freshDb();
  const a = await seedUser(db, { id: "user_sweep_a" });
  const b = await seedUser(db, { id: "user_sweep_b" });
  const plateA = await seedPlateAsset(db, a);
  const plateB = await seedPlateAsset(db, b);
  await seedLegacyPick(db, a, SHIPPED_SLUG);
  await seedLegacyPick(db, b, SHIPPED_SLUG);

  // A resolver that hands each user THEIR own asset — the shape the composition root wires, where the plate
  // is lifted into the caller's own CAS partition. A migration that pointed both users at one asset would
  // mint a cross-user reference nobody asked for.
  const perUser = (userId: UserId): ((slug: string) => Promise<ThemeBackground | null>) => resolver(userId === a ? plateA : plateB);
  expect(await migrateSeededBackgroundPicks(db, a, perUser(a), AT + 1)).toBe(1);
  expect(await migrateSeededBackgroundPicks(db, null, perUser(b), AT + 1)).toBe(1);

  expect((await readAppearance(db, a))["backgroundAssetId"]).toBe(plateA);
  expect((await readAppearance(db, b))["backgroundAssetId"]).toBe(plateB);
});
