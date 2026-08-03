import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPresetService, PresetNotFoundError, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedPreset, seedUser } from "../_support.ts";

// A non-default config (one disabled section) so "reset" produces an observable change.
const CUSTOM_CONFIG = {
  ...DEFAULT_PROMPT_CONFIG,
  sections: DEFAULT_PROMPT_CONFIG.sections.slice(0, 1),
};

describe("resetToDefault", () => {
  test("replaces an owned preset's config with the default; audits preset.resetToDefault", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    const id = await seedPreset(db, {
      id: castId<PresetId>("preset_own"),
      ownerId: owner,
      config: CUSTOM_CONFIG,
    });

    const detail = await svc.resetToDefault({ userId: owner, id });
    expect(detail.config.sections.length).toBe(DEFAULT_PROMPT_CONFIG.sections.length);
    expect(h.audits.map((a) => a.entry.action)).toContain("preset.resetToDefault");
  });

  test("is a no-op for the system default (returns it; no audit, no fork)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });

    const detail = await svc.resetToDefault({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID });
    expect(detail.id).toBe(SYSTEM_DEFAULT_PRESET_ID);
    expect(detail.isSystemDefault).toBe(true);
    expect(h.audits.length).toBe(0);
    expect((await svc.list({ userId: owner })).length).toBe(1);
  });

  test("throws PresetNotFoundError for another owner's preset", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const bsPreset = await seedPreset(db, { id: castId<PresetId>("preset_b"), ownerId: b });
    await expect(svc.resetToDefault({ userId: a, id: bsPreset })).rejects.toThrow(PresetNotFoundError);
  });
});
