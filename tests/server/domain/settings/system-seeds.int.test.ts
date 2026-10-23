// @subject packages/server/src/domain/settings/persistence/system-themes.ts
// @subject packages/server/src/domain/settings/substrate/seed-themes.ts
// @subject packages/server/src/domain/settings/seed-themes.ts
// @subject packages/server/src/entry/boot/seed-themes.ts

import { themes } from "@orb/db";
import { RETIRED_SEED_THEME_IDS, SEED_THEMES, THEME_HEARTH_ID, THEME_MOCHA_ID } from "@orb/server/domain/settings";
import { expect, test } from "@orb/testkit/node";
import { seedUser } from "@orb/testkit/node/composed";
import { eq, inArray } from "drizzle-orm";
import { seedThemes } from "#server/entry/boot/seed-themes.ts";

test("the boot root converges shipped palettes and retires shared rows without mutating owned sentinel collisions", async ({ db, clock }) => {
  const owner = await seedUser(db);
  const [ownedRetired, sharedRetired] = RETIRED_SEED_THEME_IDS;
  if (ownedRetired === undefined || sharedRetired === undefined) {
    throw new Error("the retired palette registry needs distinct owned and shared controls");
  }
  const at = clock.now();
  await db.insert(themes).values([
    { id: THEME_HEARTH_ID, ownerId: owner.id, name: "Owned collision", override: {}, css: "owned", createdAt: at, updatedAt: at },
    { id: ownedRetired, ownerId: owner.id, name: "Owned retired collision", override: {}, css: null, createdAt: at, updatedAt: at },
    { id: sharedRetired, ownerId: null, name: "Retired", override: {}, css: null, createdAt: at, updatedAt: at },
    { id: THEME_MOCHA_ID, ownerId: null, name: "Stale", override: {}, css: "stale", createdAt: at, updatedAt: at },
  ]);
  const ownedBefore = await db.select().from(themes).where(eq(themes.ownerId, owner.id)).orderBy(themes.id);
  clock.advance(10);
  await seedThemes({ db, now: clock.now });
  await seedThemes({ db, now: clock.now });

  expect(await db.select().from(themes).where(eq(themes.ownerId, owner.id)).orderBy(themes.id)).toEqual(ownedBefore);
  expect(await db.select().from(themes).where(eq(themes.id, sharedRetired))).toEqual([]);
  const expectedSeeds = SEED_THEMES.filter((row) => row.id !== THEME_HEARTH_ID);
  const actual = await db
    .select()
    .from(themes)
    .where(
      inArray(
        themes.id,
        expectedSeeds.map((row) => row.id),
      ),
    )
    .orderBy(themes.id);
  expect(actual).toEqual(
    expectedSeeds.map(({ id, name, override }) => ({
      id,
      ownerId: null,
      name,
      override,
      css: null,
      createdAt: id === THEME_MOCHA_ID ? at : clock.now(),
      updatedAt: clock.now(),
    })),
  );
});
