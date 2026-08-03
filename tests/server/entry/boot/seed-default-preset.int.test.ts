// entry/boot/seed-default-preset — the preset boot seed. Real libSQL :memory: (the .int lane). Covers: the
// single `owner_id IS NULL` sentinel default row + the ownerless PACKAGED template rows are created; the step
// is idempotent (a second run duplicates nothing). The version-gated reseed mechanics live in domain/preset/
// seed (tested there).

import { presets } from "@orb/db";
import { SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { seedDefaultPreset } from "@orb/server/entry/boot";
import { and, eq, isNull, ne } from "drizzle-orm";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("seeds the sentinel system-default row plus the ownerless packaged template(s)", async ({ clock }) => {
  const db = await freshDb();
  await seedDefaultPreset({ db, now: clock.now });

  const sentinel = await db.select().from(presets).where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID));
  expect(sentinel).toHaveLength(1);
  expect(sentinel[0]?.ownerId).toBeNull();

  // at least one ownerless PACKAGED template (non-sentinel) — the "RPG Game Master" clone source.
  const packaged = await db
    .select()
    .from(presets)
    .where(and(isNull(presets.ownerId), ne(presets.id, SYSTEM_DEFAULT_PRESET_ID)));
  expect(packaged.length).toBeGreaterThanOrEqual(1);
});

test("idempotent — a second run duplicates neither the default nor the packaged templates", async ({ clock }) => {
  const db = await freshDb();
  await seedDefaultPreset({ db, now: clock.now });
  const afterFirst = (await db.select().from(presets).where(isNull(presets.ownerId))).length;

  await seedDefaultPreset({ db, now: clock.now });
  const afterSecond = await db.select().from(presets).where(isNull(presets.ownerId));

  expect(afterSecond).toHaveLength(afterFirst);
  // exactly one sentinel default, always.
  expect(afterSecond.filter((r) => r.id === SYSTEM_DEFAULT_PRESET_ID)).toHaveLength(1);
});
