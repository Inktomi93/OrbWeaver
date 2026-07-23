// verb: clonePackaged — forks a shipped PACKAGED template into the caller's library. Pins: the clone is an
// independent OWNED row (fresh id, caller-owned, not the system default, list-visible); the packaged template
// stays OUT of the readable list (the narrowed shared arm); mutating the clone never touches the template
// row; and an unseeded template refuses with PresetNotFoundError.

import { createPresetService, ensurePackagedPresets, PresetNotFoundError } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { PACKAGED_PRESETS } from "../../../../../packages/server/src/domain/preset/contract/packaged.ts";
import { selectPackagedPreset } from "../../../../../packages/server/src/domain/preset/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, makeHarness, seedUser } from "../_support.ts";

const RPG_GM = PACKAGED_PRESETS["rpg-gm"];

describe("clonePackaged", () => {
  test("clones the packaged template into a NEW owned row; audits preset.clonePackaged", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    await ensurePackagedPresets(db, () => FROZEN_AT);

    const detail = await svc.clonePackaged({ userId: owner, key: "rpg-gm" });

    expect(detail.id).not.toBe(RPG_GM.id); // fresh id, not the template's reserved id
    expect(detail.name).toBe("RPG Game Master");
    expect(detail.kind).toBe(RPG_GM.kind);
    expect(detail.isSystemDefault).toBe(false);
    expect(detail.config.sections).toEqual(RPG_GM.config.sections);

    const clone = h.audits.find((a) => a.entry.action === "preset.clonePackaged");
    expect(clone?.entry.entityId).toBe(detail.id);
    expect(clone?.entry.metadata).toEqual({ packagedKey: "rpg-gm", clonedFrom: RPG_GM.id });

    // the clone is a normal owned library row; the packaged template is NOT in the readable list.
    const names = (await svc.list({ userId: owner })).map((s) => s.name);
    expect(names.filter((n) => n === "RPG Game Master")).toEqual(["RPG Game Master"]); // exactly the clone, not the template
  });

  test("the clone is independent — mutating it never touches the packaged template row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    await ensurePackagedPresets(db, () => FROZEN_AT);

    const clone = await svc.clonePackaged({ userId: owner, key: "rpg-gm" });
    await svc.update({ userId: owner, id: clone.id, name: "My House GM", config: { ...RPG_GM.config, sections: [] } });

    const template = await selectPackagedPreset(db, RPG_GM.id);
    expect(template?.name).toBe("RPG Game Master");
    expect(template?.config.sections).toEqual(RPG_GM.config.sections);
    expect(template?.config.sections.length).toBeGreaterThan(0);
  });

  test("refuses with PresetNotFoundError when the packaged template is unseeded", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    // NOTE: ensurePackagedPresets deliberately NOT called — no template row exists.
    await expect(svc.clonePackaged({ userId: owner, key: "rpg-gm" })).rejects.toThrow(PresetNotFoundError);
  });
});
