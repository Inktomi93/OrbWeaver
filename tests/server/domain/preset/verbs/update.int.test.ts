import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPresetService, ensureSystemDefaultPreset, PresetNotFoundError, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
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
    await expect(svc.update({ userId: a, id: bsPreset, name: "Hijack" })).rejects.toThrow(PresetNotFoundError);
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
    // The lineage is STAMPED on the row, not just narrated in the log.
    expect(forked.forkedFrom).toBe(SYSTEM_DEFAULT_PRESET_ID);
    // A DISTINCT fork action carrying the provenance (never a plain preset.create).
    const fork = h.audits.find((a) => a.entry.action === "preset.fork");
    expect(fork?.entry.metadata).toEqual({ forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: false });
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

  test("repeat COWs CONVERGE on the one fork instead of stacking rows (the multi-tab fork-once half)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);

    const first = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, name: "Tab A" });
    const second = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, name: "Tab B" });
    const third = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID });

    // ONE fork, its id stable across every later COW — the id is what the client retargets on.
    expect([second.id, third.id]).toEqual([first.id, first.id]);
    // Last write wins on the converged row; a COW with no name leaves the name alone.
    expect([second.name, third.name]).toEqual(["Tab B", "Tab B"]);
    // The library holds the default + exactly one fork (not three).
    const rows = await svc.list({ userId: owner });
    expect(rows.length).toBe(2);
    expect(rows.filter((s) => s.forkedFrom === SYSTEM_DEFAULT_PRESET_ID).map((s) => s.id)).toEqual([first.id]);
    // Every COW audits preset.fork; only the first one actually minted a row.
    expect(h.audits.filter((a) => a.entry.action === "preset.fork").map((a) => a.entry.metadata)).toEqual([
      { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: false },
      { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: true },
      { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: true },
    ]);
  });

  test("convergence is per-OWNER — another user's fork of the same default is never touched", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);

    const aFork = await svc.update({ userId: a, id: SYSTEM_DEFAULT_PRESET_ID });
    const bFork = await svc.update({ userId: b, id: SYSTEM_DEFAULT_PRESET_ID });
    expect(bFork.id).not.toBe(aFork.id);
    expect(bFork.name).toBe(aFork.name); // the derived name de-collides per-owner, so both read the same
  });

  test("a pre-existing fork PAIR (the residual race's leftovers) converges on the OLDEST, deterministically", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);
    // The residual the verb documents: two requests that both read "no fork yet" can still mint two rows.
    const older = await seedPreset(db, { id: castId<PresetId>("preset_race_a"), ownerId: owner, name: "Race A", forkedFrom: SYSTEM_DEFAULT_PRESET_ID });
    await seedPreset(db, { id: castId<PresetId>("preset_race_b"), ownerId: owner, name: "Race B", forkedFrom: SYSTEM_DEFAULT_PRESET_ID });

    // Same createdAt (the frozen clock) — the id tiebreak keeps the answer stable, and no THIRD row appears.
    expect((await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID })).id).toBe(older);
    expect((await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID })).id).toBe(older);
    expect((await svc.list({ userId: owner })).length).toBe(3);
  });
});
