// Every door that can carry a SillyTavern regex script lands it the same way: the SillyTavern folder's preset and card,
// the Characters dialog's card and the Regex page's script file. Each script reaches its pass by its own switches, a
// malformed one is refused, and a second import through the same door reuses every row it wrote. The Presets page's
// single file is pinned in `preset-file-door-scripts.int.test.ts`.
// @subject packages/server/src/domain/import/verbs/import-presets.ts
// @subject packages/server/src/domain/import/verbs/import-character.ts
// @subject packages/server/src/domain/regex/persistence/portability-write.ts
// @subject packages/server/src/primitives/serde/preset/index.ts

import { readFile } from "node:fs/promises";
import type { ImportPreviewItem } from "@orb/contracts/import";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { MAX_FIND_REGEX_LENGTH } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { z } from "zod";
import { admit, dryRun, finishRun, harness, importThroughDialog, settings } from "./_st-tree-door.ts";

const ST_AI_OUTPUT = 2;

// SillyTavern wire text is snake_case and integer placements by spec, so the files are raw JSON.
const ST_SCRIPT = {
  trimStrings: [],
  placement: [ST_AI_OUTPUT],
  disabled: false,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};
const SAVED = { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000031", scriptName: "Saved whistle", findRegex: "sings", replaceString: "whistles" };
const PANEL = {
  ...ST_SCRIPT,
  id: "c0ffee00-0000-4000-8000-000000000032",
  scriptName: "Panel kettle",
  findRegex: "<kettle>",
  replaceString: "<b>kettle</b>",
  markdownOnly: true,
};
const BELL = { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000033", scriptName: "Bell", findRegex: "bell", replaceString: "chime" };
const SCRIPTS = [SAVED, PANEL, "not a script"];
const LANDED = [
  { name: "Saved whistle", targets: ["AI_OUTPUT"], passes: ["save"] },
  { name: "Panel kettle", targets: ["AI_OUTPUT"], passes: ["display"] },
];

const presetFile = (scripts: readonly unknown[], text = "You narrate."): string =>
  JSON.stringify({
    prompts: [{ identifier: "main", name: "Main", content: text, role: "system" }],
    ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
    extensions: { ["regex_scripts"]: scripts },
  });
const PRESET_FILE = presetFile(SCRIPTS);

function cardFileWith(name: string, scripts: readonly unknown[]): string {
  return JSON.stringify({
    spec: "chara_card_v2",
    ["spec_version"]: "2.0",
    data: { name, description: `${name} keeps the kettle.`, ["first_mes"]: "The kettle sings.", extensions: { ["regex_scripts"]: scripts } },
  });
}

function cardFile(name: string): string {
  return cardFileWith(name, SCRIPTS);
}

const axesOf = (scripts: readonly { readonly name: string; readonly targets: readonly string[]; readonly passes: readonly string[] }[]): unknown =>
  scripts.map(({ name, targets, passes }) => ({ name, targets, passes }));

// The report lists each field a preset left behind under its own line; this reads the field names, not the prose.
function unmappedFieldsOf(report: string, presetName: string): readonly string[] {
  const lines = report.split("\n");
  const head = lines.findIndex((line) => line.startsWith(`- \`${presetName}\` (from `));
  if (head === -1) {
    throw new Error(`the report carries no note for ${presetName}`);
  }
  const fields: string[] = [];
  for (const line of lines.slice(head + 1)) {
    const field = /^ {2}- `([^`]+)` — /u.exec(line)?.[1];
    if (field === undefined) {
      break;
    }
    fields.push(field);
  }
  return fields;
}

test("the SillyTavern folder lands a preset's and a card's scripts on their passes, names the refused one, and reuses them on a second run", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  // A SillyTavern profile keeps its cards as PNGs; the card text rides the PNG's card chunk.
  const cardPng = writeCardChunk(new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))), cardFile("Kettle"));
  const files = { [ST_SETTINGS_FILE]: settings({}), "OpenAI Settings/Sola.json": PRESET_FILE, "characters/Kettle.png": cardPng };

  const result = await finishRun(root, await admit(root, files));
  const preset = (await caller.preset.list()).find(({ name }) => name === "Sola (OpenAI)");
  const card = (await caller.character.list({})).items.find(({ name }) => name === "Kettle");
  if (preset === undefined || card === undefined || result.reportPath === undefined) {
    throw new Error("the folder run landed no preset, no card or no report");
  }
  expect(axesOf(await caller.regex.listForPreset({ presetId: preset.id }))).toEqual(LANDED);
  expect(axesOf(await caller.regex.listForCharacter({ characterId: card.id }))).toEqual(LANDED);
  expect(unmappedFieldsOf(await readFile(result.reportPath, "utf8"), preset.name)).toEqual(["extensions.regex_scripts[2]"]);
  const library = await caller.regex.listScripts();

  await finishRun(root, await admit(root, files));
  expect(await caller.regex.listScripts()).toEqual(library);
  expect(axesOf(await caller.regex.listForPreset({ presetId: preset.id }))).toEqual(LANDED);
});

test("the SillyTavern folder's dry run names each preset script the run adds or reuses and each field it leaves out", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const files = {
    [ST_SETTINGS_FILE]: settings({}),
    "OpenAI Settings/Amber.json": PRESET_FILE,
    "OpenAI Settings/Birch.json": presetFile([SAVED, BELL], "You keep the bells."),
  };
  // The owner already holds the panel script, so the first preset reuses it from the library.
  await caller.regex.importScriptFile({ fileText: JSON.stringify(PANEL) });
  const presetsOf = async (): Promise<readonly ImportPreviewItem[]> => (await dryRun(root, files)).kinds.presets.items;
  const scriptsOf = (items: readonly ImportPreviewItem[], name: string): unknown => items.find((item) => item.name === name)?.regexScripts;

  const before = await presetsOf();
  expect(scriptsOf(before, "Amber (OpenAI)")).toEqual([{ name: "Saved whistle" }, { name: "Panel kettle", inLibrary: true }]);
  expect(scriptsOf(before, "Birch (OpenAI)")).toEqual([{ name: "Saved whistle", repeat: true }, { name: "Bell" }]);
  expect(before.find((item) => item.name === "Amber (OpenAI)")?.leftOut?.map(({ field }) => field)).toEqual(["extensions.regex_scripts[2]"]);
  expect(before.find((item) => item.name === "Birch (OpenAI)")?.leftOut).toBeUndefined();
  expect(await caller.regex.listScripts()).toHaveLength(1);
  // The folder names the sections it adds for orbweaver's own slots exactly as the Presets page does for the same file.
  const single = await caller.preset.previewFile({ fileText: PRESET_FILE, fileName: "Amber.json" });
  const added = single.ok ? single.addedSections : [];
  expect(added).toHaveLength(4);
  expect(before.find((item) => item.name === "Amber (OpenAI)")?.addedSections).toEqual(added);

  const result = await finishRun(root, await admit(root, files));
  if (result.reportPath === undefined) {
    throw new Error("the folder run wrote no report");
  }
  // The run adds exactly the two scripts the dry run said it adds, and leaves out the field it named.
  expect((await caller.regex.listScripts()).map(({ name }) => name).toSorted()).toEqual(["Bell", "Panel kettle", "Saved whistle"]);
  expect(unmappedFieldsOf(await readFile(result.reportPath, "utf8"), "Amber (OpenAI)")).toEqual(["extensions.regex_scripts[2]"]);

  const after = await presetsOf();
  const landed = (await caller.preset.list()).find(({ name }) => name === "Amber (OpenAI)");
  if (landed === undefined) {
    throw new Error("the folder run landed no Amber preset");
  }
  const sections = (await caller.preset.get({ id: landed.id })).config.sections.map(({ name }) => name);
  expect(sections).toEqual(expect.arrayContaining([...added]));
  // A second run reuses the preset it made, so it adds no section.
  expect(after.find((item) => item.name === "Amber (OpenAI)")).toMatchObject({ inLibrary: true });
  expect(after.find((item) => item.name === "Amber (OpenAI)")?.addedSections).toBeUndefined();
  expect(scriptsOf(after, "Amber (OpenAI)")).toEqual([
    { name: "Saved whistle", inLibrary: true },
    { name: "Panel kettle", inLibrary: true },
  ]);
  expect(scriptsOf(after, "Birch (OpenAI)")).toEqual([
    { name: "Saved whistle", inLibrary: true },
    { name: "Bell", inLibrary: true },
  ]);
});

test("a preset script the write door refuses is named refused by the folder's dry run, the Presets preview and the run, and lands nowhere", {
  tags: ["slow"],
}, async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const unit = "(a|b)";
  // Capture groups of alternation up to the stored length cap: storable by length, refused by the compile door.
  const heavy = {
    ...SAVED,
    id: "c0ffee00-0000-4000-8000-000000000034",
    scriptName: "Heavy",
    findRegex: unit.repeat(Math.floor(MAX_FIND_REGEX_LENGTH / unit.length)),
  };
  const file = presetFile([SAVED, heavy]);
  const files = { [ST_SETTINGS_FILE]: settings({}), "OpenAI Settings/Heavy.json": file };
  const refused = { name: "Heavy", refused: expect.stringMatching(/ms to compile/u) };

  expect((await dryRun(root, files)).kinds.presets.items[0]?.regexScripts).toEqual([{ name: "Saved whistle" }, refused]);
  expect(await caller.preset.previewFile({ fileText: file, fileName: "Heavy.json" })).toMatchObject({
    regexScripts: 1,
    refusedScripts: [{ name: "Heavy", reason: refused.refused }],
  });

  const result = await finishRun(root, await admit(root, files));
  if (result.reportPath === undefined) {
    throw new Error("the folder run wrote no report");
  }
  expect(unmappedFieldsOf(await readFile(result.reportPath, "utf8"), "Heavy (OpenAI)")).toEqual(["extensions.regex_scripts"]);
  expect((await caller.regex.listScripts()).map(({ name }) => name)).toEqual(["Saved whistle"]);
});

test("the Characters dialog lands a card's scripts on their passes and reuses them on a second import", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const cardId = async (): Promise<CharacterId> => {
    const card = (await caller.character.list({})).items.find(({ name }) => name === "Kettle");
    if (card === undefined) {
      throw new Error("the card import landed no character");
    }
    return card.id;
  };

  await importThroughDialog(root, "kettle.json", cardFile("Kettle"));
  const characterId = await cardId();
  expect(axesOf(await caller.regex.listForCharacter({ characterId }))).toEqual(LANDED);
  const library = await caller.regex.listScripts();

  await importThroughDialog(root, "kettle.json", cardFile("Kettle"));
  expect(await cardId()).toBe(characterId);
  expect(await caller.regex.listScripts()).toEqual(library);
});

test("the Regex page takes SillyTavern's own script file on its switches, refuses a malformed one, and reuses an equal one", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);

  expect(await caller.regex.importScriptFile({ fileText: JSON.stringify(PANEL) })).toMatchObject({ created: true });
  expect(axesOf(await caller.regex.listScripts())).toEqual([LANDED[1]]);
  expect(await caller.regex.importScriptFile({ fileText: JSON.stringify(PANEL) })).toMatchObject({ created: false });
  await expect(caller.regex.importScriptFile({ fileText: JSON.stringify({ scriptName: 7 }) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(axesOf(await caller.regex.listScripts())).toEqual([LANDED[1]]);
});

// SillyTavern's slash-command placement, which has no target here: a script holding only it has nothing to run on.
const ST_SLASH_COMMAND = 3;
const NOWHERE = {
  ...ST_SCRIPT,
  id: "c0ffee00-0000-4000-8000-000000000035",
  scriptName: "Slash echo",
  findRegex: "echo",
  replaceString: "ECHO",
  placement: [ST_SLASH_COMMAND],
};
const HALF = { ...BELL, id: "c0ffee00-0000-4000-8000-000000000036", scriptName: "Half bell", placement: [ST_SLASH_COMMAND, ST_AI_OUTPUT] };

/** Each named script's switch and targets in the owner's library. */
async function switchesOf(caller: Awaited<ReturnType<Awaited<ReturnType<typeof harness>>["internalCallerFor"]>>): Promise<unknown> {
  return (await caller.regex.listScripts()).map(({ name, enabled, targets }) => ({ name, enabled, targets })).toSorted((a, b) => a.name.localeCompare(b.name));
}

const SWITCHES = [
  { name: "Half bell", enabled: true, targets: ["AI_OUTPUT"] },
  { name: "Slash echo", enabled: false, targets: [] },
];

// Each door below is its own case: one harness each keeps every case inside its timeout.
test("the Presets page names a SillyTavern placement with no target here and stores a script left with none switched off", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const file = presetFile([NOWHERE, HALF]);

  // The Presets page names both lost placements before the run, and the run stores the empty script switched off.
  const preview = await caller.preset.previewFile({ fileText: file, fileName: "Echo.json" });
  expect(preview.ok ? preview.leftOut.map(({ field }) => field) : []).toEqual([
    "extensions.regex_scripts[0].placement",
    "extensions.regex_scripts[1].placement",
  ]);
  await caller.preset.importFile({ fileText: file, fileName: "Echo.json" });
  expect(await switchesOf(caller)).toEqual(SWITCHES);
});

test("the Characters dialog names a SillyTavern placement with no target here and stores a script left with none switched off", async () => {
  await using cardRoot = await harness();
  const dialog = await importThroughDialog(cardRoot, "echo.json", cardFileWith("Echo", [NOWHERE, HALF]));
  const notes = dialog.imported[0]?.notes ?? [];
  expect(
    ["data.extensions.regex_scripts[0].placement", "data.extensions.regex_scripts[1].placement"].map((field) => notes.some((note) => note.includes(field))),
  ).toEqual([true, true]);
  expect(await switchesOf(await cardRoot.internalCallerFor(cardRoot.ownerId))).toEqual(SWITCHES);
});

test("the Regex page names a SillyTavern placement with no target here and stores a script left with none switched off", async () => {
  await using fileRoot = await harness();
  const fileCaller = await fileRoot.internalCallerFor(fileRoot.ownerId);
  expect((await fileCaller.regex.importScriptFile({ fileText: JSON.stringify(NOWHERE) })).notes).toHaveLength(1);
  expect((await fileCaller.regex.importScriptFile({ fileText: JSON.stringify(HALF) })).notes).toHaveLength(1);
  expect(await switchesOf(fileCaller)).toEqual(SWITCHES);
});

test("the SillyTavern folder report names a global script's and a card's placement with no target here", async () => {
  await using folderRoot = await harness();
  const profileSettings = { ...z.record(z.string(), z.unknown()).parse(JSON.parse(settings({}))), ["extension_settings"]: { regex: [NOWHERE, HALF] } };
  const result = await finishRun(
    folderRoot,
    await admit(folderRoot, {
      [ST_SETTINGS_FILE]: JSON.stringify(profileSettings),
      "characters/Gong.png": writeCardChunk(
        new Uint8Array(makeAssetBytes(folderRoot.idSource.typeId(ID_PREFIX.asset))),
        cardFileWith("Gong", [{ ...NOWHERE, scriptName: "Gong echo" }]),
      ),
    }),
  );
  if (result.reportPath === undefined) {
    throw new Error("the folder run wrote no report");
  }
  const report = await readFile(result.reportPath, "utf8");
  for (const field of ["extension_settings.regex[0].placement", "extension_settings.regex[1].placement", "data.extensions.regex_scripts[0].placement"]) {
    expect({ field, named: report.includes(field) }).toEqual({ field, named: true });
  }
});

test("a card script the card reader refuses is named by the Characters dialog and the folder report, and is not part of the card", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const refusedField = "data.extensions.regex_scripts[2]";

  const first = await importThroughDialog(root, "kettle.json", cardFile("Kettle"));
  expect(first.imported[0]?.notes?.some((note) => note.includes(refusedField))).toBe(true);
  // The same card without the refused script is the same character: the refusal rides beside the card.
  const second = await importThroughDialog(root, "kettle.json", cardFileWith("Kettle", [SAVED, PANEL]));
  expect(second.imported[0]).toMatchObject({ created: false, characterId: first.imported[0]?.characterId });
  expect(second.imported[0]?.notes ?? []).toEqual([]);
  expect((await caller.character.list({})).items.filter(({ name }) => name === "Kettle")).toHaveLength(1);

  await using folderRoot = await harness();
  const cardPng = writeCardChunk(new Uint8Array(makeAssetBytes(folderRoot.idSource.typeId(ID_PREFIX.asset))), cardFile("Kettle"));
  const result = await finishRun(folderRoot, await admit(folderRoot, { [ST_SETTINGS_FILE]: settings({}), "characters/Kettle.png": cardPng }));
  if (result.reportPath === undefined) {
    throw new Error("the folder run wrote no report");
  }
  expect(await readFile(result.reportPath, "utf8")).toContain(refusedField);
});

test("a script that runs on no pass or no target leaves an export and comes back the same", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const base = { findRegex: "quiet", replaceString: "QUIET", substituteRegex: 0, runOnEdit: false } as const;
  const shapes = [
    { name: "No pass", targets: ["AI_OUTPUT"], passes: [] },
    { name: "No target", targets: [], passes: ["display"] },
  ] as const;
  for (const shape of shapes) {
    const row = await caller.regex.createScript({ input: { ...base, ...shape, trimStrings: [], targets: [...shape.targets], passes: [...shape.passes] } });
    const file = await caller.regex.exportScript({ scriptId: row.id });
    await caller.regex.removeScript({ scriptId: row.id });
    expect(await caller.regex.importScriptFile({ fileText: file.fileText })).toMatchObject({ created: true });
  }
  expect(
    (await caller.regex.listScripts()).map(({ name, targets, passes }) => ({ name, targets, passes })).toSorted((a, b) => a.name.localeCompare(b.name)),
  ).toEqual([
    { name: "No pass", targets: ["AI_OUTPUT"], passes: [] },
    { name: "No target", targets: [], passes: ["display"] },
  ]);
});
