// entry/boot/seed-default-preset — the system-default preset boot seed. Real libSQL :memory: (the .int lane).
// Covers: the single `owner_id IS NULL` default row is created; the step is idempotent (a second run leaves
// exactly one row). The version-gated reseed mechanics live in domain/preset/seed (tested there).

import { presets } from "@orb/db";
import { SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { seedDefaultPreset } from "@orb/server/entry/boot";
import { eq, isNull } from "drizzle-orm";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";

test("seeds the single system-default preset row", async ({ clock }) => {
  const db = await freshDb();
  await seedDefaultPreset({ db, now: clock.now });

  const rows = await db.select().from(presets).where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.ownerId).toBeNull();
});

test("idempotent — a second run leaves exactly one system-default row", async ({ clock }) => {
  const db = await freshDb();
  await seedDefaultPreset({ db, now: clock.now });
  await seedDefaultPreset({ db, now: clock.now });

  const defaults = await db.select().from(presets).where(isNull(presets.ownerId));
  expect(defaults).toHaveLength(1);
});
