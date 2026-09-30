// entry/boot/seed-default-preset — the preset boot seed. Real libSQL :memory: (the .int lane). Covers: the
// single `owner_id IS NULL` sentinel default row is the only ownerless row created; the step is idempotent (a second run duplicates nothing). The version-gated reseed mechanics live in domain/preset/
// seed (tested there).

import { presets } from "@orb/db";
import { SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { seedDefaultPreset } from "@orb/server/entry/boot";
import { isNull } from "drizzle-orm";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("seeds the sentinel system-default row as the only ownerless preset", async ({ clock }) => {
  const db = await freshDb();
  await seedDefaultPreset({ db, now: clock.now });

  const ownerless = await db.select().from(presets).where(isNull(presets.ownerId));
  expect(ownerless.map((row) => row.id)).toEqual([SYSTEM_DEFAULT_PRESET_ID]);
});

test("idempotent — a second run does not duplicate the default", async ({ clock }) => {
  const db = await freshDb();
  await seedDefaultPreset({ db, now: clock.now });
  const afterFirst = (await db.select().from(presets).where(isNull(presets.ownerId))).length;

  await seedDefaultPreset({ db, now: clock.now });
  const afterSecond = await db.select().from(presets).where(isNull(presets.ownerId));

  expect(afterSecond).toHaveLength(afterFirst);
  // exactly one sentinel default, always.
  expect(afterSecond.filter((r) => r.id === SYSTEM_DEFAULT_PRESET_ID)).toHaveLength(1);
});
