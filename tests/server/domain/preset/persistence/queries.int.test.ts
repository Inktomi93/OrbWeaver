// persistence/queries — the `presets`-table access, against a real libSQL :memory: db. Pins the USER-SCOPED
// reads/writes: the two-armed "owner OR system default" readable, list membership, owned-only update/delete
// scoping (a caller can never touch another owner's row NOR the null-owner system default), and the
// system-default seed/reseed key-on-sentinel queries.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import {
  deletePreset,
  insertPreset,
  listReadable,
  readablePreset,
  reseedSystemDefault,
  selectSystemDefault,
  updatePresetRow,
} from "../../../../../packages/server/src/domain/preset/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
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
    expect(
      await updatePresetRow(db, bsPreset, a, { name: "Hijack", updatedAt: FROZEN_AT }),
    ).toBeUndefined();
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
    await reseedSystemDefault(
      db,
      DEFAULT_PROMPT_CONFIG,
      DEFAULT_PROMPT_CONFIG.schemaVersion,
      FROZEN_AT + 5,
    );
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
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });
    expect((await readablePreset(db, owner, id))?.name).toBe("Fresh");
  });
});
