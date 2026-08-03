import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPresetService, PresetNotFoundError, PresetOperationError, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedPreset, seedUser } from "../_support.ts";

describe("remove", () => {
  test("deletes the owner's preset and audits preset.remove", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    const id = await seedPreset(db, { id: castId<PresetId>("preset_own"), ownerId: owner });

    await svc.remove({ userId: owner, id });
    await expect(svc.get({ userId: owner, id })).rejects.toThrow(PresetNotFoundError);
    expect(h.audits.map((a) => a.entry.action)).toContain("preset.remove");
  });

  test("refuses to remove the system default (cannot_remove_system_default)", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    await expect(svc.remove({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID })).rejects.toMatchObject({ code: "cannot_remove_system_default" });
    await expect(svc.remove({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID })).rejects.toThrow(PresetOperationError);
  });

  test("throws PresetNotFoundError for another owner's preset (no cross-owner delete)", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const bsPreset = await seedPreset(db, { id: castId<PresetId>("preset_b"), ownerId: b });
    await expect(svc.remove({ userId: a, id: bsPreset })).rejects.toThrow(PresetNotFoundError);
  });
});
