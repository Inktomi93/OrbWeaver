import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPresetService, ensureSystemDefaultPreset, PresetNotFoundError, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeHarness, seedPreset, seedUser } from "../_support.ts";

const PRESET_INSERT = /insert into "presets"/iu;

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
    // The audit carries the INTENT that produced the row — an absent intent is the historical `converge`.
    expect(fork?.entry.metadata).toEqual({ forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: false, intent: "converge" });
    expect(h.audits.map((a) => a.entry.action)).not.toContain("preset.create");

    // The system default row is untouched (still present, still the default).
    const original = await svc.get({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID });
    expect(original.isSystemDefault).toBe(true);
    // The owner now has the default + their fork.
    expect((await svc.list({ userId: owner })).length).toBe(2);
  });

  // side-eye 2026-08-30 P2-B (#856): the fork copied the BASE row's kind, and the base is the system
  // default, so a user's own fully-editable preset landed in the library wearing `system` — the exact word
  // this surface uses for "locked, not yours, no Export, no Reset" — in the subtitle's leading position
  // (`preset-row-view.ts`: the kind ALWAYS leads). `kind` describes what the preset IS; the provenance is
  // already carried, correctly, by the `forked from Default` clause the same subtitle renders. Asserted on
  // BOTH fork intents, because the two doors to a copy must not disagree.
  test("a COW fork is an OWNED preset, so it mints the ordinary kind — never the built-in's `system`", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);
    const base = await svc.get({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID });
    expect(base.kind, "the base this forks from is what used to leak into the fork").toBe("system");

    const converged = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, config: DEFAULT_PROMPT_CONFIG });
    expect(converged.kind).toBe("generation");

    const minted = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, fork: { mode: "new", name: "Second fork" } });
    expect(minted.kind).toBe("generation");
    // An explicitly submitted kind still wins — the fork is not a place that overrides the caller.
    const named = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, kind: "roleplay", fork: { mode: "new", name: "Third fork" } });
    expect(named.kind).toBe("roleplay");
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
      { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: false, intent: "converge" },
      { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: true, intent: "converge" },
      { forkedFrom: SYSTEM_DEFAULT_PRESET_ID, converged: true, intent: "converge" },
    ]);
  });

  test("two first converge COWs held after lookup return one shared fork id", async () => {
    const { db, hold } = await freshHeldDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);
    const inserts = hold(PRESET_INSERT, 2);

    const updates = [
      svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, name: "Tab A" }),
      svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, name: "Tab B" }),
    ] as const;
    await inserts.reached;
    inserts.release();
    const [a, b] = await Promise.all(updates);

    expect(b.id).toBe(a.id);
    expect((await svc.list({ userId: owner })).filter((row) => row.forkedFrom === SYSTEM_DEFAULT_PRESET_ID).map((row) => row.id)).toEqual([a.id]);
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

// The `fork` INTENT arms (owner ruling): the client asks the owner where a built-in edit goes once they
// already have a fork, and sends the answer. Absent/`converge` is the historical silent behavior (pinned
// above and left untouched — it stays the back-compat + race backstop); `new` is the explicit second fork.
describe("update (the fork intent)", () => {
  test("intent 'new' MINTS a second fork under the given name instead of converging", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);

    const first = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, name: "Tab A" });
    const second = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, fork: { mode: "new", name: "Default fork 2" } });

    expect(second.id).not.toBe(first.id);
    expect(second.name).toBe("Default fork 2");
    // Both rows carry the lineage — the list surface prints "forked from Default" on each.
    const rows = await svc.list({ userId: owner });
    expect(
      rows
        .filter((s) => s.forkedFrom === SYSTEM_DEFAULT_PRESET_ID)
        .map((s) => s.id)
        .sort(),
    ).toEqual([first.id, second.id].sort());
    expect(rows.length).toBe(3);
    // The mint audits the intent that produced it.
    expect(h.audits.filter((a) => a.entry.action === "preset.fork").at(-1)?.entry.metadata).toEqual({
      forkedFrom: SYSTEM_DEFAULT_PRESET_ID,
      converged: false,
      intent: "new",
    });
  });

  test("a 'new' fork carries the SUBMITTED config, and the existing fork is untouched", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);

    const existing = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID });
    const edited = { ...DEFAULT_PROMPT_CONFIG, params: { quality: "deep" as const } };
    const minted = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, config: edited, fork: { mode: "new", name: "Deep run" } });

    expect(minted.config.params.quality).toBe("deep");
    expect((await svc.get({ userId: owner, id: existing.id })).config.params.quality).toBeUndefined();
  });

  test("a 'new' fork's name is DE-COLLIDED at the write (never merged into the same-named row)", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);
    const taken = await seedPreset(db, { id: castId<PresetId>("preset_taken"), ownerId: owner, name: "Default fork 2" });

    const minted = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, fork: { mode: "new", name: "Default fork 2" } });

    expect(minted.id).not.toBe(taken);
    expect(minted.name).toBe("Default fork 2 2");
    // The same-named row is NOT the import verb's merge target here — it keeps its own lineage (none).
    expect((await svc.get({ userId: owner, id: taken })).forkedFrom).toBeNull();
  });

  test("two concurrent 'new' intents produce TWO forks — deliberate, the (owner_id, forked_from) index is non-unique", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);

    const [a, b] = await Promise.all([
      svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, fork: { mode: "new", name: "Race" } }),
      svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, fork: { mode: "new", name: "Race" } }),
    ]);

    expect(a.id).not.toBe(b.id);
    expect((await svc.list({ userId: owner })).filter((s) => s.forkedFrom === SYSTEM_DEFAULT_PRESET_ID).length).toBe(2);
  });

  test("an explicit 'converge' intent is the same behavior as an absent one", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await ensureSystemDefaultPreset(db, () => FROZEN_AT);

    const first = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, fork: { mode: "converge" } });
    const second = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, fork: { mode: "converge" }, name: "Same row" });

    expect(second.id).toBe(first.id);
    expect((await svc.list({ userId: owner })).length).toBe(2);
  });
});

// #1026 — the #471 hop one step out over the wire. The editor GETs a LENIENTLY parsed config (the read seam
// degrades an unreadable blob to DEFAULT_PROMPT_CONFIG) and PUTs the whole blob back, so the save must be
// refused rather than persist the stand-in over the user's real generation config.
describe("update — the read-derived save over an unreadable stored blob", () => {
  const seedUnreadable = async (db: Awaited<ReturnType<typeof freshDb>>, owner: Awaited<ReturnType<typeof seedUser>>): Promise<PresetId> =>
    await seedPreset(db, {
      id: castId<PresetId>("preset_degraded"),
      ownerId: owner,
      config: DEFAULT_PROMPT_CONFIG,
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion + 900,
    });

  test("REFUSES the config save and leaves the stored blob exactly as it was", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    const id = await seedUnreadable(db, owner);

    await expect(svc.update({ userId: owner, id, config: DEFAULT_PROMPT_CONFIG })).rejects.toMatchObject({ code: "stored_config_unreadable" });
    expect((await svc.get({ userId: owner, id })).schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion + 900);
  });

  test("a rename still lands — the refusal costs the config write, not the row", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    const id = await seedUnreadable(db, owner);

    const detail = await svc.update({ userId: owner, id, name: "Renamed" });
    expect(detail.name).toBe("Renamed");
    expect(detail.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion + 900);
  });

  // #1717 — one hop out from #1026: a COW fork's copy-forward arm (`params.config ?? parsePromptConfig(base.config)`)
  // descends from a read of `base`, exactly like the editor's read-derived save, so an unreadable SYSTEM
  // DEFAULT must refuse the fork rather than silently mint one carrying DEFAULT_PROMPT_CONFIG (a fork that
  // does not match the base the owner thinks they forked).
  test("a COW fork with no submitted config REFUSES over an unreadable system default, and mints NO fork (#1717)", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await seedPreset(db, {
      id: SYSTEM_DEFAULT_PRESET_ID,
      ownerId: null,
      config: DEFAULT_PROMPT_CONFIG,
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion + 900,
    });

    await expect(svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID })).rejects.toMatchObject({ code: "stored_config_unreadable" });

    expect((await svc.list({ userId: owner })).length).toBe(1);
  });

  // A caller-submitted config carries no read of the base at all — the fork mints normally even though the
  // system default's own blob is unreadable (the GUARD_EXEMPT shape: content that does not descend from a
  // read of the row it lands on).
  test("a COW fork WITH a submitted config mints normally over an unreadable system default", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await seedPreset(db, {
      id: SYSTEM_DEFAULT_PRESET_ID,
      ownerId: null,
      config: DEFAULT_PROMPT_CONFIG,
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion + 900,
    });

    const forked = await svc.update({ userId: owner, id: SYSTEM_DEFAULT_PRESET_ID, config: DEFAULT_PROMPT_CONFIG });
    expect(forked.config).toEqual(DEFAULT_PROMPT_CONFIG);
  });
});
