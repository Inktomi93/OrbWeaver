// persistence/queries — the `presets`-table access, against a real libSQL :memory: db. Pins the USER-SCOPED
// reads/writes: the two-armed "owner OR system default" readable, list membership, owned-only update/delete
// scoping (a caller can never touch another owner's row NOR the null-owner system default), and the
// system-default seed/reseed key-on-sentinel queries.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import {
  deletePreset,
  findOwnedForkOf,
  insertConvergedPresetForkIfAbsent,
  insertPreset,
  listOwned,
  listReadable,
  readablePreset,
  reseedSystemDefault,
  selectPackagedPreset,
  selectSystemDefault,
  updatePresetRow,
} from "../../../../../packages/server/src/domain/preset/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedPreset, seedUser } from "../_support.ts";

const OLDER_VERSION = DEFAULT_PROMPT_CONFIG.schemaVersion - 1;

describe("readablePreset (two-armed)", () => {
  test("an owner reads their own row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const id = await seedPreset(db, { id: castId<PresetId>("preset_own"), ownerId: owner });
    expect((await readablePreset(db, owner, id))?.id).toBe(id);
  });

  test("an owner reads the shared system default (null owner)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    expect((await readablePreset(db, owner, SYSTEM_DEFAULT_PRESET_ID))?.name).toBe("Default");
  });

  test("an owner CANNOT read another owner's row", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const bsPreset = await seedPreset(db, { id: castId<PresetId>("preset_b"), ownerId: b });
    expect(await readablePreset(db, a, bsPreset)).toBeUndefined();
  });
});

describe("listReadable", () => {
  test("returns the owner's rows PLUS the system default, not other owners'", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    await seedPreset(db, { id: castId<PresetId>("preset_a1"), ownerId: a, name: "A1" });
    await seedPreset(db, { id: castId<PresetId>("preset_b1"), ownerId: b, name: "B1" });

    const names = (await listReadable(db, a)).map((r) => r.name).sort();
    expect(names).toEqual(["A1", "Default"]);
  });

  test("the shared arm keys on the sentinel — an ownerless PACKAGED template row never leaks in", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "a");
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    // a second ownerless row (a packaged template) — NOT the sentinel.
    const packagedId = castId<PresetId>("preset_000000000000000000000rpggm");
    await seedPreset(db, { id: packagedId, ownerId: null, name: "RPG Game Master" });

    const names = (await listReadable(db, a)).map((r) => r.name);
    expect(names).toEqual(["Default"]);
    // …and it is not individually readable via the two-armed read, but IS readable as a packaged template.
    expect(await readablePreset(db, a, packagedId)).toBeUndefined();
    expect((await selectPackagedPreset(db, packagedId))?.name).toBe("RPG Game Master");
  });
});

describe("findOwnedForkOf (the COW convergence lookup)", () => {
  test("finds only the CALLER's fork of THAT source; the source row itself is never a match", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    const packagedId = castId<PresetId>("preset_000000000000000000000rpggm");
    const aFork = await seedPreset(db, { id: castId<PresetId>("preset_a_fork"), ownerId: a, name: "A fork", forkedFrom: SYSTEM_DEFAULT_PRESET_ID });
    await seedPreset(db, { id: castId<PresetId>("preset_b_fork"), ownerId: b, name: "B fork", forkedFrom: SYSTEM_DEFAULT_PRESET_ID });
    await seedPreset(db, { id: castId<PresetId>("preset_a_plain"), ownerId: a, name: "A plain" });

    expect((await findOwnedForkOf(db, a, SYSTEM_DEFAULT_PRESET_ID))?.id).toBe(aFork);
    expect(await findOwnedForkOf(db, a, packagedId)).toBeUndefined();
    // b's fork is not a's answer, and an un-forked owned row is nobody's.
    expect((await findOwnedForkOf(db, b, SYSTEM_DEFAULT_PRESET_ID))?.name).toBe("B fork");
  });

  test("picks the OLDEST when the residual race already left two (stable across calls)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    // Same frozen createdAt — the id tiebreak is what makes the answer deterministic.
    await seedPreset(db, { id: castId<PresetId>("preset_race_b"), ownerId: owner, name: "B", forkedFrom: SYSTEM_DEFAULT_PRESET_ID });
    await seedPreset(db, { id: castId<PresetId>("preset_race_a"), ownerId: owner, name: "A", forkedFrom: SYSTEM_DEFAULT_PRESET_ID });

    expect((await findOwnedForkOf(db, owner, SYSTEM_DEFAULT_PRESET_ID))?.id).toBe(castId<PresetId>("preset_race_a"));
  });
});

describe("updatePresetRow (owned-only)", () => {
  test("patches the owner's row and returns it", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const id = await seedPreset(db, { id: castId<PresetId>("preset_u"), ownerId: owner });
    const row = await updatePresetRow(db, id, owner, { name: "Renamed", updatedAt: FROZEN_AT + 1 });
    expect(row?.name).toBe("Renamed");
    expect(row?.updatedAt).toBe(FROZEN_AT + 1);
  });

  test("matches nothing for another owner's row (no cross-owner write)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const bsPreset = await seedPreset(db, { id: castId<PresetId>("preset_b"), ownerId: b });
    expect(await updatePresetRow(db, bsPreset, a, { name: "Hijack", updatedAt: FROZEN_AT })).toBeUndefined();
  });

  test("never matches the null-owner system default", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null });
    expect(
      await updatePresetRow(db, SYSTEM_DEFAULT_PRESET_ID, owner, {
        name: "X",
        updatedAt: FROZEN_AT,
      }),
    ).toBeUndefined();
  });
});

describe("deletePreset (owned-only)", () => {
  test("deletes the owner's row (true)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const id = await seedPreset(db, { id: castId<PresetId>("preset_d"), ownerId: owner });
    expect(await deletePreset(db, id, owner)).toBe(true);
    expect(await readablePreset(db, owner, id)).toBeUndefined();
  });

  test("returns false for another owner's row (no cross-owner delete)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const bsPreset = await seedPreset(db, { id: castId<PresetId>("preset_b"), ownerId: b });
    expect(await deletePreset(db, bsPreset, a)).toBe(false);
  });
});

describe("system-default seed/reseed queries", () => {
  test("selectSystemDefault finds the sentinel/null-owner row only", async () => {
    const db = await freshDb();
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    expect((await selectSystemDefault(db))?.name).toBe("Default");
  });

  test("reseedSystemDefault overwrites config + version on the sentinel row", async () => {
    const db = await freshDb();
    await seedPreset(db, {
      id: SYSTEM_DEFAULT_PRESET_ID,
      ownerId: null,
      name: "Default",
      schemaVersion: OLDER_VERSION,
    });
    await reseedSystemDefault(db, DEFAULT_PROMPT_CONFIG, DEFAULT_PROMPT_CONFIG.schemaVersion, FROZEN_AT + 5);
    const row = await selectSystemDefault(db);
    expect(row?.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion);
    expect(row?.updatedAt).toBe(FROZEN_AT + 5);
  });

  test("insertPreset writes a row readable back", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const id = castId<PresetId>("preset_ins");
    await insertPreset(db, {
      id,
      ownerId: owner,
      name: "Fresh",
      kind: "roleplay",
      config: DEFAULT_PROMPT_CONFIG,
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
      forkedFrom: null,
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });
    expect((await readablePreset(db, owner, id))?.name).toBe("Fresh");
  });
});

// The one home of the fork-uniqueness claim, shared by the COW converge arm and the host-handoff copy
// (#1572). The claim is the INSERT's own guard — the `(owner_id, forked_from)` index is deliberately NOT
// unique, so nothing but this statement narrows it, and the narrowing is per-PAIR, never per-owner.
describe("insertConvergedPresetForkIfAbsent (the guarded admission)", () => {
  const forkRow = (id: string, ownerId: UserId, forkedFrom: PresetId): Parameters<typeof insertConvergedPresetForkIfAbsent>[1] => ({
    id: castId<PresetId>(id),
    ownerId,
    name: id,
    kind: "roleplay",
    config: DEFAULT_PROMPT_CONFIG,
    schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
    forkedFrom,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });

  test("admits the FIRST fork of a pair and refuses the second (undefined), leaving one row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const source = await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });

    const first = await insertConvergedPresetForkIfAbsent(db, forkRow("preset_first", owner, source));
    const second = await insertConvergedPresetForkIfAbsent(db, forkRow("preset_second", owner, source));

    expect(first?.id).toBe(castId<PresetId>("preset_first"));
    expect(first?.forkedFrom).toBe(source);
    expect(second).toBeUndefined();
    // The refused row was never written — a loser converges by reading, not by leaving debris.
    expect((await listOwned(db, owner)).map((row) => row.id)).toEqual([castId<PresetId>("preset_first")]);
  });

  test("the guard is on the PAIR: another SOURCE and another OWNER are both still admitted", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const defaultSource = await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    const packaged = await seedPreset(db, { id: castId<PresetId>("preset_000000000000000000000rpggm"), ownerId: null, name: "RPG GM" });
    await insertConvergedPresetForkIfAbsent(db, forkRow("preset_a_default", a, defaultSource));

    // Same owner, DIFFERENT source — a distinct pair, so it admits.
    expect((await insertConvergedPresetForkIfAbsent(db, forkRow("preset_a_packaged", a, packaged)))?.id).toBe(castId<PresetId>("preset_a_packaged"));
    // Different owner, SAME source — convergence is per-owner, so it admits.
    expect((await insertConvergedPresetForkIfAbsent(db, forkRow("preset_b_default", b, defaultSource)))?.id).toBe(castId<PresetId>("preset_b_default"));
    expect((await listOwned(db, a)).length).toBe(2);
  });
});
