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
    const update = h.audits.find((a) => a.entry.action === "preset.update");
    // metadata records the scalar EDITS + the config-replace flag (not the config blob itself).
    expect(update?.entry.metadata).toEqual({
      edits: { name: "Renamed", kind: "assistant" },
      configUpdated: false,
    });
  });

  test("a config-only update records configUpdated:true with an empty edits set", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    const id = await seedPreset(db, { id: castId<PresetId>("preset_cfg"), ownerId: owner });

    await svc.update({ userId: owner, id, config: DEFAULT_PROMPT_CONFIG });
    const update = h.audits.find((a) => a.entry.action === "preset.update");
    expect(update?.entry.metadata).toEqual({ edits: {}, configUpdated: true });
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
  test("editing the system default forks a NEW owned preset (different id); audits the distinct preset.fork", async () => {
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
    // A DISTINCT fork action carrying the provenance (never a plain preset.create).
    const fork = h.audits.find((a) => a.entry.action === "preset.fork");
    expect(fork?.entry.metadata).toEqual({ forkedFrom: SYSTEM_DEFAULT_PRESET_ID });
    expect(h.audits.map((a) => a.entry.action)).not.toContain("preset.create");

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

  test("a COW with NO submitted name gets the `(edited)` suffix off the base name", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);
    const base = await svc.get({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID });

    const forked = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID });
    expect(forked.name).toBe(`${base.name} (edited)`);
  });
});
