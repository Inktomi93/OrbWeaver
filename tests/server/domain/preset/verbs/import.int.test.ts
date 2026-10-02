import type { PromptConfig } from "@orb/contracts/preset";
import { buildPresetFile, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { presets } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { createExportPresets, createImportPresets } from "@orb/server/domain/preset";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedPreset, seedUser } from "../_support.ts";

/** A non-default config so a round-trip / merge actually carries a distinguishing value. */
const richConfig = (temperature: number): PromptConfig => ({
  ...DEFAULT_PROMPT_CONFIG,
  params: { temperature },
});

const fileBytes = (name: string, config: PromptConfig): Uint8Array => new TextEncoder().encode(JSON.stringify(buildPresetFile(name, config)));

/** The owner's own rows (name → stored config), read straight from the table. */
async function ownedRows(db: Awaited<ReturnType<typeof freshDb>>, owner: UserId): Promise<{ name: string; config: PromptConfig }[]> {
  const rows = await db.select().from(presets).where(eq(presets.ownerId, owner));
  return rows.map((r) => ({ name: r.name, config: r.config }));
}

describe("import (orb-native backup)", () => {
  test("a fresh orb.preset file creates a new owned preset (created:true); audits preset.import", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const importPreset = createImportPresets(h.ctx);
    const owner = await seedUser(db);

    const outcome = await importPreset({
      ownerId: owner,
      bytes: fileBytes("Backup", richConfig(0.9)),
    });

    expect(outcome).toEqual({ ok: true, created: true, presetId: "preset_00000000000000000000000001", name: "Backup", renamedFrom: null });
    const rows = await ownedRows(db, owner);
    expect(rows.map((r) => r.name)).toEqual(["Backup"]);
    expect(rows[0]?.config.params.temperature).toBe(0.9);
    const audit = h.audits.find((a) => a.entry.action === "preset.import");
    expect(audit?.entry.metadata).toEqual({ name: "Backup", renamedFrom: null });
  });

  test("idempotent: re-importing an EQUAL preset reuses the row (created:false, nothing written)", async () => {
    const db = await freshDb();
    const importPreset = createImportPresets(makeHarness(db).ctx);
    const owner = await seedUser(db);

    const first = await importPreset({ ownerId: owner, bytes: fileBytes("Backup", richConfig(0.3)) });
    const second = await importPreset({ ownerId: owner, bytes: fileBytes("Backup", richConfig(0.3)) });

    expect(first.created).toBe(true);
    expect(second).toEqual({ ok: true, created: false, presetId: "preset_00000000000000000000000001", name: "Backup", renamedFrom: null });
    expect((await ownedRows(db, owner)).map((r) => r.name)).toEqual(["Backup"]);
  });

  test("ADDITIVE: a same-named DIFFERENT preset lands beside the original under a numbered name; the original is untouched", async () => {
    const db = await freshDb();
    const importPreset = createImportPresets(makeHarness(db).ctx);
    const owner = await seedUser(db);

    await importPreset({ ownerId: owner, bytes: fileBytes("Backup", richConfig(0.3)) });
    const second = await importPreset({ ownerId: owner, bytes: fileBytes("Backup", richConfig(1.1)) });

    expect(second).toEqual({ ok: true, created: true, presetId: "preset_00000000000000000000000002", name: "Backup 2", renamedFrom: "Backup" });
    const rows = (await ownedRows(db, owner)).toSorted((a, b) => a.name.localeCompare(b.name));
    expect(rows.map((r) => [r.name, r.config.params.temperature])).toEqual([
      ["Backup", 0.3],
      ["Backup 2", 1.1],
    ]);
  });

  test("a malformed file returns { ok:false } and writes nothing (never throws)", async () => {
    const db = await freshDb();
    const importPreset = createImportPresets(makeHarness(db).ctx);
    const owner = await seedUser(db);

    const notJson = await importPreset({
      ownerId: owner,
      bytes: new TextEncoder().encode("<<<not json"),
    });
    const wrongKind = await importPreset({
      ownerId: owner,
      bytes: new TextEncoder().encode(JSON.stringify({ schemaKind: "something-else", config: {} })),
    });

    expect(notJson.ok).toBe(false);
    expect(wrongKind.ok).toBe(false);
    expect(await ownedRows(db, owner)).toEqual([]);
  });

  test("verb round-trip: export → import into another owner reproduces the same config", async () => {
    const db = await freshDb();
    const ctx = makeHarness(db).ctx;
    const exportPresets = createExportPresets(ctx);
    const importPreset = createImportPresets(ctx);
    const source = await seedUser(db, "src");
    const target = await seedUser(db, "dst");
    await seedPreset(db, { ownerId: source, name: "Traveler", config: richConfig(0.7) });

    const [file] = await exportPresets({ ownerId: source });
    const outcome = await importPreset({ ownerId: target, bytes: file?.bytes ?? new Uint8Array() });

    expect(outcome).toEqual({ ok: true, created: true, presetId: "preset_00000000000000000000000001", name: "Traveler", renamedFrom: null });
    const rows = await ownedRows(db, target);
    expect(rows.map((r) => r.name)).toEqual(["Traveler"]);
    expect(rows[0]?.config.params.temperature).toBe(0.7);
  });

  // A preset whose stored blob this build cannot read is never an equal-content match (its bytes are
  // compared as stored), so the file lands BESIDE it and the unreadable row stays for the owner to delete
  // (the editor marks it unreadable). An import never edits an owned row (owner ruling).
  test("lands beside a same-named preset whose stored blob this build cannot read; the dead row stays", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const importPreset = createImportPresets(h.ctx);
    const owner = await seedUser(db);
    await seedPreset(db, {
      ownerId: owner,
      name: "Traveler",
      config: richConfig(0.1),
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion + 900,
    });

    const outcome = await importPreset({ ownerId: owner, bytes: fileBytes("Traveler", richConfig(0.9)) });

    expect(outcome).toMatchObject({ ok: true, created: true, name: "Traveler 2", renamedFrom: "Traveler" });
    const rows = (await ownedRows(db, owner)).toSorted((a, b) => a.name.localeCompare(b.name));
    expect(rows.map((r) => [r.name, r.config.params.temperature])).toEqual([
      ["Traveler", 0.1],
      ["Traveler 2", 0.9],
    ]);
  });
});
