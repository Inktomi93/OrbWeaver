// @subject packages/server/src/domain/preset/verbs/import.ts
// @subject packages/server/src/primitives/serde/preset/index.ts
// A SillyTavern preset's bundled scripts are part of what makes two imported presets the same, in their order: two
// files equal but for their scripts land as two presets, each with only its own scripts, through the Presets page and
// the folder, and each door's preview says so before the run. A script's switch is not part of it, since one library
// row holds one switch for every preset it is attached to. A script the import refuses or cannot run is named in the
// preset's own script list at both doors, and the preview's verdict is the run's.
import { readFile } from "node:fs/promises";
import type { ImportPreviewItem } from "@orb/contracts/import";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { PresetId } from "@orb/kit/ids";
import { MAX_FIND_REGEX_LENGTH } from "@orb/kit/regex";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { admit, dryRun, finishRun, harness, settings } from "./_st-tree-door.ts";

const ST_AI_OUTPUT = 2;

// SillyTavern wire text is snake_case and integer placements by spec, so the files are raw JSON.
const ST_SCRIPT = {
  trimStrings: [],
  placement: [ST_AI_OUTPUT],
  disabled: false,
  markdownOnly: true,
  promptOnly: false,
  runOnEdit: false,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};
const script = (n: number, name: string, extra: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> => ({
  ...ST_SCRIPT,
  id: `c0ffee00-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
  scriptName: name,
  findRegex: `<${name.toLowerCase().replaceAll(" ", "-")}>`,
  replaceString: `<div>${name}</div>`,
  ...extra,
});
const STATUS = script(41, "Status panel");
const MOOD = script(42, "Mood panel");
const MAP = script(43, "Map panel");

const presetFile = (scripts: readonly unknown[]): string =>
  JSON.stringify({
    prompts: [{ identifier: "main", name: "Main", content: "You narrate the Sola campaign.", role: "system" }],
    ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
    extensions: { ["regex_scripts"]: scripts },
  });

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

async function attachedNames(caller: Caller, presetId: PresetId): Promise<readonly string[]> {
  return (await caller.regex.listForPreset({ presetId })).map(({ name }) => name);
}

async function importedPreset(
  caller: Caller,
  fileText: string,
): Promise<{ readonly presetId: PresetId; readonly created: boolean; readonly name: string | undefined }> {
  const outcome = await caller.preset.importFile({ fileText, fileName: "Sola.json" });
  if (!outcome.ok || outcome.presetId === undefined) {
    throw new Error("the Presets page landed no preset");
  }
  return { presetId: outcome.presetId, created: outcome.created === true, name: outcome.name };
}

// Thirteen door calls, each measuring its scripts' patterns in a worker.
test("on the Presets page a preset equal but for its scripts or their order lands beside, an equal one reuses, and a script's switch is not identity", {
  tags: ["slow"],
}, async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const full = presetFile([STATUS, MOOD]);
  const other = presetFile([STATUS, MAP]);
  const reordered = presetFile([MOOD, STATUS]);
  const switchedOff = presetFile([STATUS, { ...MOOD, disabled: true }]);

  const first = await importedPreset(caller, full);
  expect(first).toMatchObject({ created: true, name: "Sola" });

  expect(await caller.preset.previewFile({ fileText: other, fileName: "Sola.json" })).toMatchObject({ ok: true, inLibrary: false });
  const second = await importedPreset(caller, other);
  // A different preset under a taken name lands under the next free name.
  expect(second).toMatchObject({ created: true, name: "Sola 2" });
  expect(await attachedNames(caller, first.presetId)).toEqual(["Status panel", "Mood panel"]);
  expect(await attachedNames(caller, second.presetId)).toEqual(["Status panel", "Map panel"]);

  // SillyTavern runs a preset's scripts in its order, so the same scripts in another order are another preset.
  expect(await caller.preset.previewFile({ fileText: reordered, fileName: "Sola.json" })).toMatchObject({ ok: true, inLibrary: false });
  const third = await importedPreset(caller, reordered);
  expect(third).toMatchObject({ created: true, name: "Sola 3" });
  expect(await attachedNames(caller, third.presetId)).toEqual(["Mood panel", "Status panel"]);

  // Each file reuses the preset it made.
  const presets = await caller.preset.list();
  for (const [fileText, landed] of [
    [full, first],
    [other, second],
    [reordered, third],
  ] as const) {
    expect(await caller.preset.previewFile({ fileText, fileName: "Sola.json" })).toMatchObject({ ok: true, inLibrary: true });
    expect(await importedPreset(caller, fileText)).toMatchObject({ created: false, presetId: landed.presetId });
  }

  // One switch for one script row: a file whose only difference is a script's disabled flag is the first preset again.
  expect(await caller.preset.previewFile({ fileText: switchedOff, fileName: "Sola.json" })).toMatchObject({ ok: true, inLibrary: true });
  expect(await importedPreset(caller, switchedOff)).toMatchObject({ created: false, presetId: first.presetId });
  expect(await caller.preset.list()).toEqual(presets);
  expect(await attachedNames(caller, first.presetId)).toEqual(["Status panel", "Mood panel"]);
});

test("a folder with two presets equal but for their scripts previews and lands two presets, each with only its own scripts", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const files = {
    [ST_SETTINGS_FILE]: settings({}),
    "OpenAI Settings/Sola Full.json": presetFile([STATUS, MOOD]),
    "OpenAI Settings/Sola Twenty.json": presetFile([STATUS, MAP]),
    // The positive control: a file equal to the first, scripts included, is a repeat.
    "OpenAI Settings/Sola Twin.json": presetFile([STATUS, MOOD]),
  };
  const itemOf = (items: readonly ImportPreviewItem[], name: string): ImportPreviewItem | undefined => items.find((item) => item.name === name);

  const preview = (await dryRun(root, files)).kinds.presets;
  expect(present(itemOf(preview.items, "Sola Full (OpenAI)")).reuse).toBeUndefined();
  expect(present(itemOf(preview.items, "Sola Twenty (OpenAI)")).reuse).toBeUndefined();
  expect(itemOf(preview.items, "Sola Twin (OpenAI)")?.reuse).toBe("upload");
  expect(preview.counts).toMatchObject({ repeat: 1 });

  await finishRun(root, await admit(root, files));
  const landed = new Map((await caller.preset.list()).map(({ name, id }) => [name, id]));
  const full = landed.get("Sola Full (OpenAI)");
  const twenty = landed.get("Sola Twenty (OpenAI)");
  if (full === undefined || twenty === undefined) {
    throw new Error("the folder run did not land both presets");
  }
  expect(landed.has("Sola Twin (OpenAI)")).toBe(false);
  expect(await attachedNames(caller, full)).toEqual(["Status panel", "Mood panel"]);
  expect(await attachedNames(caller, twenty)).toEqual(["Status panel", "Map panel"]);

  // A second run of the same folder reuses both.
  const again = (await dryRun(root, files)).kinds.presets.items;
  expect(itemOf(again, "Sola Full (OpenAI)")?.reuse).toBe("library");
  expect(itemOf(again, "Sola Twenty (OpenAI)")?.reuse).toBe("library");
});

test("a preset script that does not compile imports switched off and one over a length cap is refused, each named by both previews and the run", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const broken = script(44, "Broken pattern", { findRegex: "/([unclosed/g" });
  const huge = script(45, "Huge pattern", { findRegex: "a".repeat(MAX_FIND_REGEX_LENGTH + 1) });
  const fileText = presetFile([STATUS, broken, huge]);
  const files = { [ST_SETTINGS_FILE]: settings({}), "OpenAI Settings/Sola.json": fileText };
  const capReason = expect.stringContaining(`over the ${String(MAX_FIND_REGEX_LENGTH)} character limit`);
  const brokenField = "extensions.regex_scripts[1].findRegex";

  const item = (await dryRun(root, files)).kinds.presets.items[0];
  expect(item?.regexScripts).toEqual([{ name: "Status panel" }, { name: "Broken pattern" }, { name: "Huge pattern", refused: capReason }]);
  expect(item?.leftOut?.map(({ field }) => field)).toEqual([brokenField]);
  const single = await caller.preset.previewFile({ fileText, fileName: "Sola.json" });
  expect(single).toMatchObject({ ok: true, regexScripts: 2, refusedScripts: [{ name: "Huge pattern", reason: capReason }] });
  expect(single.ok ? single.leftOut.map(({ field }) => field) : []).toEqual([brokenField]);

  const result = await finishRun(root, await admit(root, files));
  if (result.reportPath === undefined) {
    throw new Error("the folder run wrote no report");
  }
  const report = await readFile(result.reportPath, "utf8");
  expect(report).toContain(brokenField);
  expect(report).toContain("Huge pattern");
  const library = await caller.regex.listScripts();
  expect(library.map(({ name, enabled }) => ({ name, enabled })).toSorted((a, b) => a.name.localeCompare(b.name))).toEqual([
    { name: "Broken pattern", enabled: false },
    { name: "Status panel", enabled: true },
  ]);

  // The Presets page reads the same file to the same verdicts.
  const outcome = await caller.preset.importFile({ fileText, fileName: "Sola.json" });
  expect(outcome).toMatchObject({ ok: true, created: false, regexScripts: { created: 0, reused: 2, refused: [{ name: "Huge pattern", reason: capReason }] } });
});
