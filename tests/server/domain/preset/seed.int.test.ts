// seed: ensureSystemDefaultPreset — the boot seeder. Pins: first boot inserts the single null-owner row;
// the reseed is schemaVersion-GATED (a bump overwrites; an equal/newer stored version is left alone —
// preset.md esoteric #3); and the seeder is idempotent across boots.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { ensureSystemDefaultPreset, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { selectSystemDefault } from "../../../../packages/server/src/domain/preset/persistence/queries.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures";
import { FROZEN_AT, seedPreset } from "./_support.ts";

const OLDER_VERSION = DEFAULT_PROMPT_CONFIG.schemaVersion - 1;

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
