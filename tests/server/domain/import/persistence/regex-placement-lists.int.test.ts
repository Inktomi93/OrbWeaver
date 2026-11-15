// SillyTavern's loader rewrites its retired display placement (0) on the global list only. On a preset's or a card's
// list, and in a single script file, 0 is a placement with no target. A script whose passes read none of its targets
// runs nowhere. Every door stores such a script switched off and names it, and a door's preview says what its run
// stores.
// @subject packages/contracts/src/regex/schemas.ts
// @subject packages/server/src/primitives/serde/regex/index.ts
// @subject packages/server/src/domain/import/loader/collect.ts

import { readFile } from "node:fs/promises";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";
import { admit, dryRun, finishRun, harness, importThroughDialog, settings } from "./_st-tree-door.ts";

// SillyTavern wire placements are integers by spec, so the files are raw JSON.
const ST_RETIRED_DISPLAY = 0;
const ST_AI_OUTPUT = 2;
const ST_WORLD_INFO = 5;

const script = (n: number, scriptName: string, placement: readonly number[]): Record<string, unknown> => ({
  id: `c0ffee00-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
  scriptName,
  findRegex: scriptName,
  replaceString: "x",
  trimStrings: [],
  placement,
  disabled: false,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
});

// Neither switch is set on any of them.
const ZERO_ALONE = script(1, "Zero alone", [ST_RETIRED_DISPLAY]);
const ZERO_MIX = script(2, "Zero mix", [ST_RETIRED_DISPLAY, ST_AI_OUTPUT]);
const LORE_SAVE = script(3, "Lore save", [ST_WORLD_INFO]);
const SCOPED = [ZERO_ALONE, ZERO_MIX, LORE_SAVE];

// A scoped 0 runs nowhere; beside AI output it is a lost placement, and the script saves; world info is never saved.
const SCOPED_STORED = [
  { name: "Lore save", enabled: false, targets: ["WORLD_INFO"], passes: ["save"] },
  { name: "Zero alone", enabled: false, targets: [], passes: ["save"] },
  { name: "Zero mix", enabled: true, targets: ["AI_OUTPUT"], passes: ["save"] },
];
const SCOPED_NAMED = (field: string): readonly string[] => [0, 1, 2].map((i) => `${field}[${i}].placement`);

type Caller = Awaited<ReturnType<Awaited<ReturnType<typeof harness>>["internalCallerFor"]>>;

async function storedOf(caller: Caller): Promise<unknown> {
  return (await caller.regex.listScripts())
    .map(({ name, enabled, targets, passes }) => ({ name, enabled, targets, passes }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

const presetFile = (scripts: readonly unknown[]): string =>
  JSON.stringify({
    prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
    ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
    extensions: { ["regex_scripts"]: scripts },
  });

const cardFile = (name: string, scripts: readonly unknown[]): string =>
  JSON.stringify({
    spec: "chara_card_v2",
    ["spec_version"]: "2.0",
    data: { name, description: `${name} keeps the lore.`, ["first_mes"]: "Hello.", extensions: { ["regex_scripts"]: scripts } },
  });

test("the Presets page reads a preset's placement 0 as no target, names each script that runs nowhere, and stores what it previewed", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const file = presetFile(SCOPED);

  const preview = await caller.preset.previewFile({ fileText: file, fileName: "Zero.json" });
  if (!preview.ok) {
    throw new Error("the Presets page refused a well-formed SillyTavern preset");
  }
  expect(preview.leftOut.map(({ field }) => field)).toEqual(SCOPED_NAMED("extensions.regex_scripts"));
  expect(preview.refusedScripts).toEqual([]);
  const outcome = await caller.preset.importFile({ fileText: file, fileName: "Zero.json" });
  expect(outcome.ok ? outcome.regexScripts : undefined).toMatchObject({ created: preview.regexScripts, reused: 0, refused: [] });
  expect(await storedOf(caller)).toEqual(SCOPED_STORED);
  // The preview counts apart the attached scripts that come in switched off, as the run stores them.
  expect(preview.regexScriptsOff).toBe(SCOPED_STORED.filter(({ enabled }) => !enabled).length);
});

test("the Characters dialog reads a card's placement 0 as no target and names each script that runs nowhere", async () => {
  await using root = await harness();
  const dialog = await importThroughDialog(root, "lore.json", cardFile("Lore", SCOPED));
  const notes = dialog.imported[0]?.notes ?? [];
  expect(SCOPED_NAMED("data.extensions.regex_scripts").map((field) => notes.some((note) => note.includes(field)))).toEqual([true, true, true]);
  expect(await storedOf(await root.internalCallerFor(root.ownerId))).toEqual(SCOPED_STORED);
});

test("the Regex page reads a script file's placement 0 as no target and names each script that runs nowhere", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  for (const one of SCOPED) {
    expect((await caller.regex.importScriptFile({ fileText: JSON.stringify(one) })).notes).toHaveLength(1);
  }
  expect(await storedOf(caller)).toEqual(SCOPED_STORED);
});

test("the SillyTavern folder rewrites placement 0 on the global list alone, and its dry run names the preset's as its run does", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const globals = [
    script(4, "Global alone", [ST_RETIRED_DISPLAY]),
    script(5, "Global mix", [ST_RETIRED_DISPLAY, ST_AI_OUTPUT]),
    script(6, "Global lore", [ST_WORLD_INFO]),
  ];
  const profileSettings = { ...z.record(z.string(), z.unknown()).parse(JSON.parse(settings({}))), ["extension_settings"]: { regex: globals } };
  const files = { [ST_SETTINGS_FILE]: JSON.stringify(profileSettings), "OpenAI Settings/Zero.json": presetFile(SCOPED) };

  const preset = (await dryRun(root, files)).kinds.presets.items.find(({ name }) => name === "Zero (OpenAI)");
  expect(preset?.leftOut?.map(({ field }) => field)).toEqual(SCOPED_NAMED("extensions.regex_scripts"));
  expect(preset?.regexScripts).toEqual([{ name: "Zero alone" }, { name: "Zero mix" }, { name: "Lore save" }]);

  const result = await finishRun(root, await admit(root, files));
  if (result.reportPath === undefined) {
    throw new Error("the folder run wrote no report");
  }
  const report = await readFile(result.reportPath, "utf8");
  const named = (field: string): { field: string; named: boolean } => ({ field, named: report.includes(field) });
  expect(
    [
      "extension_settings.regex[0].placement",
      "extension_settings.regex[1].placement",
      "extension_settings.regex[2].placement",
      ...SCOPED_NAMED("extensions.regex_scripts"),
    ].map(named),
  ).toEqual([
    { field: "extension_settings.regex[0].placement", named: false },
    { field: "extension_settings.regex[1].placement", named: false },
    { field: "extension_settings.regex[2].placement", named: true },
    ...SCOPED_NAMED("extensions.regex_scripts").map((field) => ({ field, named: true })),
  ]);
  // SillyTavern's loader reads a lone global 0 as every placement and sets both switches on either shape.
  expect(await storedOf(caller)).toEqual([
    { name: "Global alone", enabled: true, targets: ["USER_INPUT", "AI_OUTPUT", "WORLD_INFO", "REASONING"], passes: ["display", "prompt"] },
    { name: "Global lore", enabled: false, targets: ["WORLD_INFO"], passes: ["save"] },
    { name: "Global mix", enabled: true, targets: ["AI_OUTPUT"], passes: ["display", "prompt"] },
    ...SCOPED_STORED,
  ]);
});
