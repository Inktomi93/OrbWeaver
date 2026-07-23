// seed: ensureSystemDefaultPreset + ensurePackagedPresets — the boot seeders. Pins: first boot inserts the
// single null-owner default row; the reseed is schemaVersion-GATED (a bump overwrites; an equal/newer stored
// version is left alone); the seeders are idempotent across boots; the packaged template is seeded ownerless
// at its reserved id.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { ensurePackagedPresets, ensureSystemDefaultPreset, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { PACKAGED_PRESETS } from "../../../../packages/server/src/domain/preset/contract/packaged.ts";
import { selectPackagedPreset, selectSystemDefault } from "../../../../packages/server/src/domain/preset/persistence/queries.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { FROZEN_AT, seedPreset } from "./_support.ts";

const OLDER_VERSION = DEFAULT_PROMPT_CONFIG.schemaVersion - 1;
const RPG_GM = PACKAGED_PRESETS["rpg-gm"];

describe("ensureSystemDefaultPreset", () => {
  test("first boot inserts the single null-owner system default row", async () => {
    const db = await freshDb();
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);
    const row = await selectSystemDefault(db);
    expect(row?.id).toBe(SYSTEM_DEFAULT_PRESET_ID);
    expect(row?.ownerId).toBeNull();
    expect(row?.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion);
  });

  test("is idempotent — a second boot does not duplicate or overwrite the equal-version row", async () => {
    const db = await freshDb();
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT + 999);
    const row = await selectSystemDefault(db);
    // updatedAt unchanged → the second call took the no-op branch (version equal, not below).
    expect(row?.updatedAt).toBe(FROZEN_AT);
  });

  test("a stored version BELOW the default forces a reseed (overwrites config + version)", async () => {
    const db = await freshDb();
    await seedPreset(db, {
      id: SYSTEM_DEFAULT_PRESET_ID,
      ownerId: null,
      name: "Stale",
      schemaVersion: OLDER_VERSION,
    });
    await ensureSystemDefaultPreset(db, () => FROZEN_AT + 7);
    const row = await selectSystemDefault(db);
    expect(row?.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion);
    expect(row?.updatedAt).toBe(FROZEN_AT + 7);
  });
});

describe("ensurePackagedPresets", () => {
  test("first boot inserts the packaged RPG GM template ownerless at its reserved id", async () => {
    const db = await freshDb();
    await ensurePackagedPresets(db, () => FROZEN_AT);
    const row = await selectPackagedPreset(db, RPG_GM.id);
    expect(row?.id).toBe(RPG_GM.id);
    expect(row?.ownerId).toBeNull();
    expect(row?.name).toBe("RPG Game Master");
    expect(row?.schemaVersion).toBe(RPG_GM.config.schemaVersion);
  });

  test("is idempotent — a second boot does not duplicate or overwrite the equal-version row", async () => {
    const db = await freshDb();
    await ensurePackagedPresets(db, () => FROZEN_AT);
    await ensurePackagedPresets(db, () => FROZEN_AT + 999);
    const row = await selectPackagedPreset(db, RPG_GM.id);
    // updatedAt unchanged → the second call took the no-op branch (version equal, not below).
    expect(row?.updatedAt).toBe(FROZEN_AT);
  });

  test("a stored version BELOW the registry config forces a reseed", async () => {
    const db = await freshDb();
    await seedPreset(db, {
      id: RPG_GM.id,
      ownerId: null,
      name: "Stale GM",
      schemaVersion: OLDER_VERSION,
    });
    await ensurePackagedPresets(db, () => FROZEN_AT + 7);
    const row = await selectPackagedPreset(db, RPG_GM.id);
    expect(row?.name).toBe("RPG Game Master");
    expect(row?.schemaVersion).toBe(RPG_GM.config.schemaVersion);
    expect(row?.updatedAt).toBe(FROZEN_AT + 7);
  });
});
