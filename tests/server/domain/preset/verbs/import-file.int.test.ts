// importFile — the SINGLE-preset import door (§16.1 G6). The door owns no semantics, so what needs proving
// is exactly that: the bytes the EXPORT arm produces round-trip through it, and the bundle's own rules
// (idempotent on `(ownerId, name)` → merge in place; contained error on a malformed file) reach the caller
// unchanged. A divergence here would mean a second serde or a second collision rule had grown — the banned
// parallel path.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { presets } from "@orb/db";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createExportPresets, createPresetService } from "@orb/server/domain/preset";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, seedPreset, seedUser } from "../_support.ts";

const configWith = (temperature: number): PromptConfig => ({ ...DEFAULT_PROMPT_CONFIG, params: { temperature } });

describe("importFile", () => {
  test("round-trips the EXPORT arm's own bytes: export → importFile → the same config, one row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);
    await seedPreset(db, { id: castId<PresetId>("preset_rt"), ownerId: owner, name: "Roundtrip", config: configWith(0.42) });

    // The bundle's export arm — the ONE serde both doors read (`buildPresetFile`).
    const [file] = await createExportPresets(h.ctx)({ ownerId: owner });
    expect(file).toBeDefined();

    const stranger = await seedUser(db, "stranger");
    const outcome = await svc.importFile({ userId: stranger, fileText: new TextDecoder().decode(file?.bytes) });

    expect(outcome).toStrictEqual({ ok: true, created: true });
    const rows = await db.select().from(presets).where(eq(presets.ownerId, stranger));
    expect(rows.map((r) => r.name)).toStrictEqual(["Roundtrip"]);
    expect(rows[0]?.config.params.temperature).toBe(0.42);
  });

  test("inherits the bundle's collision rule: the same name MERGES in place, never a second row", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);
    const text = (temperature: number): string =>
      JSON.stringify({ schemaKind: "orb.preset", schemaVersion: 4, name: "Shared", config: configWith(temperature) });

    expect(await svc.importFile({ userId: owner, fileText: text(0.3) })).toStrictEqual({ ok: true, created: true });
    expect(await svc.importFile({ userId: owner, fileText: text(1.1) })).toStrictEqual({ ok: true, created: false });

    const rows = await db.select().from(presets).where(eq(presets.ownerId, owner));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.config.params.temperature).toBe(1.1);
  });

  test("a malformed file is a CONTAINED error, never a throw and never a row", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const owner = await seedUser(db);

    const notJson = await svc.importFile({ userId: owner, fileText: "<html>nope</html>" });
    const wrongKind = await svc.importFile({ userId: owner, fileText: JSON.stringify({ schemaKind: "orb.character", name: "X", config: {} }) });

    expect(notJson.ok).toBe(false);
    expect(wrongKind.ok).toBe(false);
    expect(wrongKind.error).toContain("orb.preset");
    expect(await db.select().from(presets).where(eq(presets.ownerId, owner))).toStrictEqual([]);
  });
});
