// verb: update — owned patch + the copy-on-write of the system default (preset.md esoteric #2).

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  createPresetService,
  ensureSystemDefaultPreset,
  PresetNotFoundError,
  SYSTEM_DEFAULT_PRESET_ID,
} from "@orb/server/domain/preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, makeHarness, seedPreset, seedUser } from "../_support.ts";

describe("update (owned)", () => {
  test("patches name/kind on the owner's row; audits preset.update", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    const id = await seedPreset(db, { id: castId<PresetId>("preset_own"), ownerId: owner });

    const detail = await svc.update({ userId: owner, id, name: "Renamed", kind: "assistant" });
    expect(detail.id).toBe(id);
    expect(detail.name).toBe("Renamed");
    expect(detail.kind).toBe("assistant");
    expect(h.audits.map((a) => a.entry.action)).toContain("preset.update");
  });

  test("throws PresetNotFoundError for another owner's row (no cross-owner write)", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const bsPreset = await seedPreset(db, { id: castId<PresetId>("preset_b"), ownerId: b });
    await expect(svc.update({ userId: a, id: bsPreset, name: "Hijack" })).rejects.toThrow(
      PresetNotFoundError,
    );
  });
});

describe("update (copy-on-write of the system default)", () => {
  test("editing the system default forks a NEW owned preset (different id); audits preset.create", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);

    const forked = await svc.update({
      userId: owner,
      id: SYSTEM_DEFAULT_PRESET_ID,
      name: "My fork",
      config: DEFAULT_PROMPT_CONFIG,
    });

    // The COW signal: a NEW id, owned (not the system default).
    expect(forked.id).not.toBe(SYSTEM_DEFAULT_PRESET_ID);
    expect(forked.isSystemDefault).toBe(false);
    expect(forked.name).toBe("My fork");
    expect(h.audits.map((a) => a.entry.action)).toContain("preset.create");

    // The system default row is untouched (still present, still the default).
    const original = await svc.get({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID });
    expect(original.isSystemDefault).toBe(true);
    // The owner now has the default + their fork.
    expect((await svc.list({ userId: owner })).length).toBe(2);
  });

  test("a COW with no submitted config forks from the system default's own config", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);

    const forked = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, name: "Copy" });
    expect(forked.config.sections.length).toBe(DEFAULT_PROMPT_CONFIG.sections.length);
  });
});
