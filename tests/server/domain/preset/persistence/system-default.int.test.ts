// @subject packages/server/src/domain/preset/persistence/system-default.ts
// @subject packages/server/src/domain/preset/seed.ts

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { closeDb, presets } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { ensureSystemDefaultPreset } from "@orb/server/domain/preset";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger, freshHeldDb } from "@orb/testkit/node/composed";
import { seedUser } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";
import { SYSTEM_DEFAULT_PRESET_ID, SYSTEM_DEFAULT_PRESET_KIND, SYSTEM_DEFAULT_PRESET_NAME } from "#server/domain/preset/constants.ts";

test("the boot root creates the shipped default and upgrades only its shared sentinel row", async ({ db, clock }) => {
  const at = clock.now();
  await ensureSystemDefaultPreset(databaseHandle(db), clock.now, createTestLogger());
  const [created] = await db.select().from(presets).where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID));
  expect(created).toMatchObject({
    ownerId: null,
    config: DEFAULT_PROMPT_CONFIG,
    schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
    createdAt: at,
    updatedAt: at,
  });
  await db
    .update(presets)
    .set({ config: { ...DEFAULT_PROMPT_CONFIG, params: { temperature: 0.1 } }, schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion - 1 })
    .where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID));
  clock.advance(10);
  await ensureSystemDefaultPreset(databaseHandle(db), clock.now, createTestLogger());
  expect(await db.select().from(presets).where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID))).toEqual([
    { ...created, config: DEFAULT_PROMPT_CONFIG, schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion, updatedAt: clock.now() },
  ]);
});

test("the boot root never overwrites an owned row colliding with the system sentinel", async ({ db, clock }) => {
  const owner = await seedUser(db);
  await db.insert(presets).values({
    id: SYSTEM_DEFAULT_PRESET_ID,
    ownerId: owner.id,
    name: SYSTEM_DEFAULT_PRESET_NAME,
    kind: SYSTEM_DEFAULT_PRESET_KIND,
    config: { ...DEFAULT_PROMPT_CONFIG, params: { temperature: 0.2 } },
    schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion - 1,
    forkedFrom: null,
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  const before = await db.select().from(presets).where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID));
  clock.advance(10);
  await expect(ensureSystemDefaultPreset(databaseHandle(db), clock.now, createTestLogger())).rejects.toThrow();
  expect(await db.select().from(presets).where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID))).toEqual(before);
});

test("the reseed update rechecks null ownership after the root read while preserving the competing owner's bytes", async ({ clock }) => {
  const { db, hold } = await freshHeldDb();
  try {
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(databaseHandle(db), clock.now, createTestLogger());
    await db
      .update(presets)
      .set({ schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion - 1 })
      .where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID));
    const fence = hold(/^update "presets" set "config"/iu);
    clock.advance(10);
    const pending = ensureSystemDefaultPreset(databaseHandle(db), clock.now, createTestLogger());
    let ownedBefore: (typeof presets.$inferSelect)[] = [];
    try {
      await fence.reached;
      fence.disarm();
      // The real driver is paused after the root's shared-row read, not after its UPDATE has entered SQLite.
      await db.update(presets).set({ ownerId: owner.id }).where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID));
      ownedBefore = await db.select().from(presets).where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID));
    } finally {
      fence.release();
    }
    await pending;
    expect(ownedBefore[0]?.ownerId).toBe(owner.id);
    expect(await db.select().from(presets).where(eq(presets.id, SYSTEM_DEFAULT_PRESET_ID))).toEqual(ownedBefore);
  } finally {
    closeDb(db);
  }
});
