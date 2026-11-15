// Every door that can carry a SillyTavern regex script lands it the same way: the SillyTavern folder's preset and card,
// the Characters dialog's card and the Regex page's script file. Each script reaches its pass by its own switches, a
// malformed one is refused, and a second import through the same door reuses every row it wrote. The Presets page's
// single file is pinned in `preset-file-door-scripts.int.test.ts`.
// @subject packages/server/src/domain/import/verbs/import-presets.ts
// @subject packages/server/src/domain/import/verbs/import-character.ts
// @subject packages/server/src/domain/regex/persistence/portability-write.ts
// @subject packages/server/src/primitives/serde/preset/index.ts

import { readFile } from "node:fs/promises";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { expect, test } from "@orb/testkit/node";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { admit, finishRun, harness, importThroughDialog, settings } from "./_st-tree-door.ts";

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
const SCRIPTS = [SAVED, PANEL, "not a script"];
const LANDED = [
  { name: "Saved whistle", targets: ["AI_OUTPUT"], passes: ["save"] },
  { name: "Panel kettle", targets: ["AI_OUTPUT"], passes: ["display"] },
];

const PRESET_FILE = JSON.stringify({
  prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
  extensions: { ["regex_scripts"]: SCRIPTS },
});

function cardFile(name: string): string {
  return JSON.stringify({
    spec: "chara_card_v2",
    ["spec_version"]: "2.0",
    data: { name, description: `${name} keeps the kettle.`, ["first_mes"]: "The kettle sings.", extensions: { ["regex_scripts"]: SCRIPTS } },
  });
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
