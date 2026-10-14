import { DEFAULT_PROMPT_CONFIG, PROMPT_CONFIG_SCHEMA_VERSION, promptConfigWriteSchema } from "@orb/contracts/preset";
import { closeDb, presets, users } from "@orb/db";
import { createIdSource } from "@orb/kit/ids";
import { ensureSystemDefaultPreset } from "@orb/server/domain/preset";
import { eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import { freshDb } from "../db.ts";
import { expect, test } from "../fixtures.ts";
import { seedPreset } from "./preset.ts";
import { seedUser } from "./user.ts";

test("owned preset rows reuse their real user FK and persist the supplied config's version", async () => {
  const db = await freshDb();
  try {
    const source = createIdSource(createSeededIds().next);
    const owner = await seedUser(db, {}, source);
    const config = promptConfigWriteSchema.parse({ ...DEFAULT_PROMPT_CONFIG, schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION + 1 });
    const row = await seedPreset(db, { ownerId: owner.id, config }, source);
    const [stored] = await db.select().from(presets).where(eq(presets.id, row.id));
    expect(await db.select().from(users)).toHaveLength(1);
    expect(stored?.ownerId).toBe(owner.id);
    expect(stored?.config).toEqual(config);
    expect(stored?.schemaVersion).toBe(config.schemaVersion);
  } finally {
    closeDb(db);
  }
});

test("a real system-seeder row retains null ownership without creating a phantom user", async () => {
  const producerDb = await freshDb();
  try {
    await ensureSystemDefaultPreset(producerDb, () => FROZEN_AT_MS);
    const produced = await producerDb.select().from(presets);
    expect(produced).toHaveLength(1);
    const row = produced[0];
    if (row === undefined) {
      throw new Error("The production system seeder did not produce its row");
    }
    const consumerDb = await freshDb();
    try {
      await seedPreset(consumerDb, row, createIdSource(createSeededIds().next));
      expect(await consumerDb.select().from(users)).toEqual([]);
      expect(await consumerDb.select().from(presets)).toEqual(produced);
    } finally {
      closeDb(consumerDb);
    }
  } finally {
    closeDb(producerDb);
  }
});
