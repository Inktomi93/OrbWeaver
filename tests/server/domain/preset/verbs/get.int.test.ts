// verb: get — read one readable preset (own OR system default); PresetNotFoundError otherwise.

import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  createPresetService,
  PresetNotFoundError,
  SYSTEM_DEFAULT_PRESET_ID,
} from "@orb/server/domain/preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, seedPreset, seedUser } from "../_support.ts";

describe("get", () => {
  test("reads the owner's own preset", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    const id = await seedPreset(db, { id: castId<PresetId>("preset_own"), ownerId: owner });
    expect((await svc.get({ userId: owner, id })).id).toBe(id);
  });

  test("reads the shared system default", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    const d = await svc.get({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID });
    expect(d.isSystemDefault).toBe(true);
  });

  test("throws PresetNotFoundError for another owner's preset", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const bsPreset = await seedPreset(db, { id: castId<PresetId>("preset_b"), ownerId: b });
    await expect(svc.get({ userId: a, id: bsPreset })).rejects.toThrow(PresetNotFoundError);
  });
});
