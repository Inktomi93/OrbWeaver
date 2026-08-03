// persistence/queries — the settings db layer (queries only). Asserts the read/write asymmetry
// (`ensureUserSettings` seeds; a pure read does not), the global-KV round-trip, the app-override row, AND
// the two load-bearing parse invariants threaded through `readUserSettings`:
//   • storedVersion (the COLUMN) BEATS the in-blob probe — a stored-v2 flat blob does NOT re-run the v1
//     lift (the corruption guard); a stored-v1 flat blob DOES lift into namespaces.
//   • self-heal-not-nuke — a single corrupt field heals to its default via per-field `.catch` while valid
//     siblings survive (the whole blob is NOT reset to defaults).

import type { UserSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { userSettings } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
  ensureUserSettings,
  readAppOverrideRaw,
  readGlobalSetting,
  readUserSettings,
  upsertGlobalSetting,
  writeAppOverride,
  writeUserConfig,
} from "../../../../../packages/server/src/domain/settings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1_750_000_000_000;

// Insert a raw `user_settings` row with a crafted (possibly legacy/corrupt) blob + version column.
async function insertRaw(db: Db, userId: UserId, schemaVersion: number, config: Record<string, unknown>): Promise<void> {
  await db.insert(userSettings).values({ userId, schemaVersion, config: config as unknown as UserSettings, updatedAt: AT });
}

describe("readUserSettings", () => {
  test("a never-touched account reads defaults with updatedAt 0 and NO row", async () => {
    const db = await freshDb();
    const u = await seedUser(db, { id: "user_u" });
    const view = await readUserSettings(db, u);
    expect(view.updatedAt).toBe(0);
    expect(view.config.memory.enabled).toBe(false);
    expect(await db.select().from(userSettings).where(eq(userSettings.userId, u))).toHaveLength(0);
  });

  test("storedVersion=1 (the column) → the v1→v2 lift folds the flat grab-bag into namespaces", async () => {
    const db = await freshDb();
    const u = await seedUser(db, { id: "user_u" });
    await insertRaw(db, u, 1, { defaultPersonaId: "p1", memoryEnabled: true, wiScanDepth: 12 });
    const { config } = await readUserSettings(db, u);
    expect(config.seeds.defaultPersonaId).toBe("p1");
    expect(config.memory.enabled).toBe(true);
    expect(config.worldInfo.scanDepth).toBe(12);
  });

  test("storedVersion=2 (the column) BEATS the in-blob probe → the v1 lift does NOT re-run", async () => {
    const db = await freshDb();
    const u = await seedUser(db, { id: "user_u" });
    // Same flat blob, but the COLUMN says v2 (and the blob carries no in-blob schemaVersion). Without the
    // column thread the probe would read v1 and lift; with it, no lift runs and the unknown flat keys are
    // dropped by the v2 schema (proves the column wins — the corruption guard against re-running lifts).
    await insertRaw(db, u, 2, { defaultPersonaId: "p1", memoryEnabled: true, wiScanDepth: 12 });
    const { config } = await readUserSettings(db, u);
    expect(config.seeds.defaultPersonaId).toBeNull();
    expect(config.memory.enabled).toBe(false);
    expect(config.worldInfo.scanDepth).not.toBe(12);
  });

  test("self-heal-not-nuke: a corrupt field heals to default while valid siblings survive", async () => {
    const db = await freshDb();
    const u = await seedUser(db, { id: "user_u" });
    // worldInfo.scanDepth is out of range (max 200) → per-field `.catch` heals it; memory.enabled is valid.
    await insertRaw(db, u, 2, { memory: { enabled: true }, worldInfo: { scanDepth: 99_999 } });
    const { config } = await readUserSettings(db, u);
    expect(config.worldInfo.scanDepth).not.toBe(99_999);
    expect(config.memory.enabled).toBe(true);
  });
});

describe("ensureUserSettings / writeUserConfig", () => {
  test("ensureUserSettings is idempotent (one row after two calls)", async () => {
    const db = await freshDb();
    const u = await seedUser(db, { id: "user_u" });
    await ensureUserSettings(db, u, AT);
    await ensureUserSettings(db, u, AT);
    expect(await db.select().from(userSettings).where(eq(userSettings.userId, u))).toHaveLength(1);
  });

  test("writeUserConfig seeds-then-writes, stamping the version column + updatedAt", async () => {
    const db = await freshDb();
    const u = await seedUser(db, { id: "user_u" });
    const before = await readUserSettings(db, u);
    await writeUserConfig(db, u, { ...before.config, memory: { enabled: true } }, AT + 5);
    const after = await readUserSettings(db, u);
    expect(after.config.memory.enabled).toBe(true);
    expect(after.updatedAt).toBe(AT + 5);
    expect(after.schemaVersion).toBeGreaterThan(0);
  });
});

describe("global KV + app-override row", () => {
  test("readGlobalSetting is null for a missing key; upsert round-trips", async () => {
    const db = await freshDb();
    expect(await readGlobalSetting(db, "k")).toBeNull();
    const view = await upsertGlobalSetting(db, "k", { a: 1 }, AT);
    expect(view.value).toEqual({ a: 1 });
    expect((await readGlobalSetting(db, "k"))?.value).toEqual({ a: 1 });
  });

  test("readAppOverrideRaw is undefined until writeAppOverride lands", async () => {
    const db = await freshDb();
    expect(await readAppOverrideRaw(db)).toBeUndefined();
    await writeAppOverride(db, { logLevel: "debug", schemaVersion: 2 }, AT);
    expect(await readAppOverrideRaw(db)).toEqual({ logLevel: "debug", schemaVersion: 2 });
  });
});
