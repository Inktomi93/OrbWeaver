import { PRESET_SCHEMA_KIND, parsePresetFile } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createExportPresets, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedPreset, seedUser } from "../_support.ts";

const decode = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(bytes));

describe("export (orb-native backup)", () => {
  test("emits one orb.preset file per OWNED preset; excludes the system default; filename = slug(name).json", async () => {
    const db = await freshDb();
    const exportPresets = createExportPresets(makeHarness(db).ctx);
    const owner = await seedUser(db, "a");
    const other = await seedUser(db, "b");
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    await seedPreset(db, { id: castId<PresetId>("preset_a1"), ownerId: owner, name: "My RP" });
    await seedPreset(db, { id: castId<PresetId>("preset_b1"), ownerId: other, name: "Theirs" });

    const files = await exportPresets({ ownerId: owner });

    // Only the owner's own preset — never the un-owned system default nor another owner's row.
    expect(files.map((f) => f.filename)).toEqual(["my-rp.json"]);
    const parsed = parsePresetFile(decode(files[0]?.bytes ?? new Uint8Array()));
    if (!parsed.ok) {
      throw new Error(`expected the exported bytes to re-parse, got: ${parsed.error}`);
    }
    expect(parsed.name).toBe("My RP");
    expect((decode(files[0]?.bytes ?? new Uint8Array()) as { schemaKind: string }).schemaKind).toBe(PRESET_SCHEMA_KIND);
  });

  test("an owner with no presets exports nothing", async () => {
    const db = await freshDb();
    const exportPresets = createExportPresets(makeHarness(db).ctx);
    const owner = await seedUser(db);
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });

    expect(await exportPresets({ ownerId: owner })).toEqual([]);
  });
});
