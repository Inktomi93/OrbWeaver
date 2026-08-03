import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPresetService, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedPreset, seedUser } from "../_support.ts";

describe("list", () => {
  test("returns the owner's rows + the system default, excluding other owners'", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    await seedPreset(db, { id: castId<PresetId>("preset_a1"), ownerId: a, name: "A1" });
    await seedPreset(db, { id: castId<PresetId>("preset_b1"), ownerId: b, name: "B1" });

    const summaries = await svc.list({ userId: a });
    expect(summaries.map((s) => s.name).sort()).toEqual(["A1", "Default"]);
    expect(summaries.find((s) => s.name === "Default")?.isSystemDefault).toBe(true);
    expect(summaries.find((s) => s.name === "A1")?.isSystemDefault).toBe(false);
  });

  test("a summary carries the fork lineage the client's subtitle reads (null for a born-here row)", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const a = await seedUser(db, "a");
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });
    await seedPreset(db, { id: castId<PresetId>("preset_a1"), ownerId: a, name: "A1" });
    await seedPreset(db, { id: castId<PresetId>("preset_a2"), ownerId: a, name: "A2", forkedFrom: SYSTEM_DEFAULT_PRESET_ID });

    // Sorted by name, not positional — every row shares the frozen `createdAt` the list orders on.
    const summaries = await svc.list({ userId: a });
    expect(summaries.map((s) => [s.name, s.forkedFrom]).sort()).toEqual([
      ["A1", null],
      ["A2", SYSTEM_DEFAULT_PRESET_ID],
      ["Default", null],
    ]);
  });
});
