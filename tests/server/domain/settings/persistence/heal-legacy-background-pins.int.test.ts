// persistence/heal-legacy-background-pins — #1600. A `user_settings` row pinning an asset that predates
// #1478.1's ownership+kind guard (or whose kind was never `background`) refuses EVERY settings write for
// that user; the heal clears the stale pointer so the row is writable again, and does not touch a row that
// has nothing stale to clear.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { assets, userSettings } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { healLegacyBackgroundPins } from "../../../../../packages/server/src/domain/settings/persistence/heal-legacy-background-pins.ts";
import { writeUserConfig } from "../../../../../packages/server/src/domain/settings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1_750_000_000_000;

test("a legacy pin (asset kind != background) blocks every write, and the heal clears it (#1600)", async () => {
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_legacy" });
  const staleId = mintTypeId(ID_PREFIX.asset);
  // Pre-#1478 shape: the pinned asset is the user's own, but its kind was never `background` (a card).
  await db.insert(assets).values({ id: staleId, ownerId: u, kind: "card", mime: "image/png", size: 1, hash: "h", uploadedAt: AT });
  await db.insert(userSettings).values({
    userId: u,
    schemaVersion: DEFAULT_USER_SETTINGS.schemaVersion,
    config: {
      ...DEFAULT_USER_SETTINGS,
      appearance: { ...DEFAULT_USER_SETTINGS.appearance, backgroundImageKind: "asset", backgroundAssetId: staleId, backgroundAssetHash: "h" },
    },
    updatedAt: AT,
  });

  // PREMISE: an unrelated round-trip write is refused — the stale pointer carries forward untouched.
  const before = await readRow(db, u);
  const err = await writeUserConfig(db, u, { ...before.config, memory: { enabled: true } }, AT + 1).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(DomainOperationError);
  expect((err as DomainOperationError).code).toBe("background_unavailable");

  const healed = await healLegacyBackgroundPins(db);
  expect(healed).toBe(1);

  const afterHeal = await readRow(db, u);
  expect(afterHeal.config.appearance.backgroundImageKind).toBe("none");
  expect(afterHeal.config.appearance.backgroundAssetId).toBe("");

  // The same round-trip write now succeeds.
  await writeUserConfig(db, u, { ...afterHeal.config, memory: { enabled: true } }, AT + 2);
  expect((await readRow(db, u)).config.memory.enabled).toBe(true);
});

test("a library entry naming a non-background asset is dropped; a valid background survives", async () => {
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_lib" });
  const bgId = mintTypeId(ID_PREFIX.asset);
  const staleId = mintTypeId(ID_PREFIX.asset);
  await db.insert(assets).values([
    { id: bgId, ownerId: u, kind: "background", mime: "image/png", size: 1, hash: "bg", uploadedAt: AT },
    { id: staleId, ownerId: u, kind: "avatar", mime: "image/png", size: 1, hash: "stale", uploadedAt: AT },
  ]);
  await db.insert(userSettings).values({
    userId: u,
    schemaVersion: DEFAULT_USER_SETTINGS.schemaVersion,
    config: {
      ...DEFAULT_USER_SETTINGS,
      appearance: {
        ...DEFAULT_USER_SETTINGS.appearance,
        backgroundLibrary: [
          { entryId: "keep", assetId: bgId, assetHash: "bg", mime: "image/png", name: "Keep" },
          { entryId: "drop", assetId: staleId, assetHash: "stale", mime: "image/png", name: "Drop" },
        ],
      },
    },
    updatedAt: AT,
  });

  const healed = await healLegacyBackgroundPins(db);
  expect(healed).toBe(1);

  const after = await readRow(db, u);
  expect(after.config.appearance.backgroundLibrary.map((e) => e.entryId)).toEqual(["keep"]);
});

test("nothing stale: the heal is a no-op and does not rewrite the row", async () => {
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_clean" });
  const bgId = mintTypeId(ID_PREFIX.asset);
  await db.insert(assets).values({ id: bgId, ownerId: u, kind: "background", mime: "image/png", size: 1, hash: "h", uploadedAt: AT });
  await db.insert(userSettings).values({
    userId: u,
    schemaVersion: DEFAULT_USER_SETTINGS.schemaVersion,
    config: {
      ...DEFAULT_USER_SETTINGS,
      appearance: { ...DEFAULT_USER_SETTINGS.appearance, backgroundImageKind: "asset", backgroundAssetId: bgId, backgroundAssetHash: "h" },
    },
    updatedAt: AT,
  });

  expect(await healLegacyBackgroundPins(db)).toBe(0);
  expect((await readRow(db, u)).config.appearance.backgroundAssetId).toBe(bgId);
});

test("an unreadable row is skipped, not healed — it is #471's refusal to fix, not this heal's", async () => {
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_corrupt" });
  await db.insert(userSettings).values({
    userId: u,
    // A negative schemaVersion + no per-field .catch on the top-level shape degrades the WHOLE parse.
    schemaVersion: 9,
    // @orb-waive no-test-fabrication(unknown): a deliberately UNREADABLE blob — this arm proves the heal SKIPS a row the read seam cannot parse Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    config: { schemaVersion: -5 } as unknown as typeof DEFAULT_USER_SETTINGS,
    updatedAt: AT,
  });

  expect(await healLegacyBackgroundPins(db)).toBe(0);
  const row = await readRow(db, u);
  expect(row.config).toEqual({ schemaVersion: -5 });
});

async function readRow(db: Db, userId: UserId): Promise<typeof userSettings.$inferSelect> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId as never));
  if (row === undefined) {
    throw new Error(`no user_settings row for ${userId}`);
  }
  return row;
}
