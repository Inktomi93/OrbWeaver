// A preset whose stored config text is not JSON reads as unreadable, with the reset door, instead of throwing: the
// config column carries the text whole, the read names `not-json`, the guarded config write refuses and keeps the
// bytes, and reset repairs the row. The library export leaves it out and names it in the export report rather than
// writing the default config as the user's preset; a newer build's preset exports as stored.
// @subject packages/server/src/domain/preset/persistence/queries.ts
// @subject packages/server/src/domain/preset/verbs/export.ts
// @subject packages/server/src/entry/http/export.ts
// @subject packages/server/src/domain/import/loader/import-bundle.ts
// @subject packages/db/src/custom-types/index.ts
import type { PortableExportNote } from "@orb/contracts/portability";
import { PORTABLE_DIRECTORIES, PORTABLE_EXPORT_CARRY } from "@orb/contracts/portability";
import { DEFAULT_PROMPT_CONFIG, PROMPT_CONFIG_SCHEMA_VERSION } from "@orb/contracts/preset";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { presets } from "@orb/db";
import type { PresetId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { expect, test } from "@orb/testkit/node";
import { exportLibrary, readLibraryExport, restoreBundle, signedInBox } from "@orb/testkit/node/composed";
import type { SQL } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import { STORED_CONFIG_UNREADABLE } from "#server/primitives/stored-config/index.ts";

// Text a truncated write leaves behind: no JSON parser reads it.
const NOT_JSON = '{"schemaVersion": 3, "sections": [';

test("a preset holding text that is not JSON reads as unreadable, refuses a config write and keeps its bytes until reset", async ({ harness }) => {
  const userId = harness.ownerId;
  const created = await harness.services.preset.create({ userId, name: "Kept", kind: "chat", config: DEFAULT_PROMPT_CONFIG });
  await harness.db
    .update(presets)
    .set({ config: sql`${NOT_JSON}` })
    .where(eq(presets.id, created.id));
  // The stored text itself, read past the column's decoding.
  const stored = async (): Promise<unknown> =>
    await harness.db
      .select({ text: sql<string>`${presets.config}` })
      .from(presets)
      .where(eq(presets.id, created.id));
  const before = await stored();

  const read = await harness.services.preset.get({ userId, id: created.id });
  expect({ configUnreadable: read.configUnreadable, config: read.config }).toEqual({
    configUnreadable: VERSIONED_PARSE_FAILURES.notJson,
    config: DEFAULT_PROMPT_CONFIG,
  });
  await expect(harness.services.preset.update({ userId, id: created.id, config: read.config })).rejects.toMatchObject({ code: STORED_CONFIG_UNREADABLE });
  expect(await stored()).toEqual(before);
  // A name-only write never reads the config, so it is not refused, and it leaves the bytes as they are.
  await harness.services.preset.update({ userId, id: created.id, name: "Renamed" });
  expect(await stored()).toEqual(before);

  const reset = await harness.services.preset.resetToDefault({ userId, id: created.id });
  expect(reset.configUnreadable).toBeNull();
  expect(await stored()).not.toEqual(before);
});

const PRESET_NAMES = ["Alpha", "Bravo", "Charlie"] as const;
const PLANTED = PRESET_NAMES[1];
const PRESET_PLANTS = ["future-version", "not-json"] as const;
type PresetPlant = (typeof PRESET_PLANTS)[number];
// A newer build's version stamp over an unchanged config, or text no JSON parser reads.
const PLANT: Record<PresetPlant, { readonly schemaVersion: number } | { readonly config: SQL }> = {
  "future-version": { schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION + 1 },
  "not-json": { config: sql`${NOT_JSON}` },
};
const NOTES: Record<PresetPlant, readonly PortableExportNote[]> = {
  "future-version": [],
  "not-json": [
    { kind: "preset", item: PLANTED, code: STORED_CONFIG_UNREADABLE, failure: VERSIONED_PARSE_FAILURES.notJson, carried: PORTABLE_EXPORT_CARRY.leftOut },
  ],
};
const presetPath = (name: string): string => `${PORTABLE_DIRECTORIES.preset}${slugifyHandle(name)}.json`;

async function plantPresets(box: Awaited<ReturnType<typeof signedInBox>>): Promise<PresetId> {
  const ids = new Map<string, PresetId>();
  for (const name of PRESET_NAMES) {
    ids.set(name, (await box.services.preset.create({ userId: box.ownerId, name, kind: "chat", config: DEFAULT_PROMPT_CONFIG })).id);
  }
  const planted = ids.get(PLANTED);
  if (planted === undefined) {
    throw new Error("the planted preset was not created");
  }
  return planted;
}

test.for(PRESET_PLANTS)(
  "the library export of three presets, one holding a %s config, finishes the zip with every readable preset as stored and names the one it left out",
  async (plant) => {
    await using box = await signedInBox();
    const planted = await plantPresets(box);
    const before = await readLibraryExport(box, ["preset"]);
    // Positive control: every preset, the planted one included, exports while readable, and nothing is reported.
    expect(PRESET_NAMES.map((name) => before.files.has(presetPath(name)))).toEqual(PRESET_NAMES.map(() => true));
    expect(before.report).toBeNull();

    await box.db.update(presets).set(PLANT[plant]).where(eq(presets.id, planted));
    const after = await readLibraryExport(box, ["preset"]);

    const leftOut = new Set(NOTES[plant].map((note) => presetPath(note.item)));
    expect(after.files).toEqual(new Map([...before.files].filter(([path]) => !leftOut.has(path))));
    expect(after.report).toEqual(NOTES[plant].length === 0 ? null : { notes: NOTES[plant] });
  },
);

test("a library zip carrying its export report restores without counting the report as a skipped file", async () => {
  await using box = await signedInBox();
  const planted = await plantPresets(box);
  await box.db.update(presets).set(PLANT["not-json"]).where(eq(presets.id, planted));
  const archive = await exportLibrary(box, ["preset"]);
  // Positive control: the archive under test carries the report.
  expect((await readLibraryExport(box, ["preset"])).report).not.toBeNull();

  expect(await restoreBundle(box, archive)).toEqual({ status: "succeeded", skipped: 0, failed: 0 });
});
