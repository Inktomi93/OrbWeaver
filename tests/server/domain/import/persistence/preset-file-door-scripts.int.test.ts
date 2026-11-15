// @subject packages/server/src/domain/preset/verbs/import-file.ts
// @subject packages/server/src/primitives/serde/preset/index.ts
// A SillyTavern preset picked on the Presets page lands with its own regex scripts attached, through the same parse
// the profile folder uses. The preview states what the run does before it runs, a re-import adds nothing, and the
// folder door reading the same file finds the preset and its scripts already in the library.
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import { admit, finishRun, harness, settings } from "./_st-tree-door.ts";

const ST_AI_OUTPUT = 2;
const FILE_NAME = "Flame Complete.json";
const PRESET_NAME = "Flame Complete";

// SillyTavern wire text is snake_case and integer placements by spec, so the preset is raw JSON.
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

const PRESET_FILE = JSON.stringify({
  // SillyTavern names an imported preset by its file stem and never reads this field.
  name: "Inner name",
  prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
  ["mystery_knob"]: "on",
  extensions: {
    ["regex_scripts"]: [
      { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000011", scriptName: "Status panel", findRegex: "<status>", replaceString: "<div>status</div>" },
      { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000012", scriptName: "Mood panel", findRegex: "<mood>", replaceString: "<div>mood</div>" },
      "not a script",
    ],
  },
});

test("a SillyTavern preset through the Presets page door brings its regex scripts, states them first, and lands once", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const file = { fileText: PRESET_FILE, fileName: FILE_NAME };
  const scriptsBefore = (await caller.regex.listScripts()).length;

  const preview = await caller.preset.previewFile(file);
  expect(preview).toMatchObject({ ok: true, format: "sillyTavern", name: PRESET_NAME, inLibrary: false, sectionCount: 1, regexScripts: 2 });
  const leftOut = preview.ok ? preview.leftOut.map(({ field }) => field) : [];
  // The unrecognised knob is the positive control: the report reads top-level fields, and `name` is not among them.
  expect(leftOut).toEqual(["mystery_knob", "extensions.regex_scripts[2]"]);
  expect((await caller.regex.listScripts()).length).toBe(scriptsBefore);

  const imported = await caller.preset.importFile(file);
  expect(imported).toMatchObject({ ok: true, created: true, name: PRESET_NAME, regexScripts: { created: 2, reused: 0 } });
  if (!imported.ok || imported.presetId === undefined) {
    throw new Error("the import landed no preset");
  }
  const presetId = imported.presetId;
  const attachedScripts = async (): Promise<unknown> =>
    (await caller.regex.listForPreset({ presetId })).map(({ name, targets, passes }) => ({ name, targets, passes }));
  const attached = [
    { name: "Status panel", targets: ["AI_OUTPUT"], passes: ["display"] },
    { name: "Mood panel", targets: ["AI_OUTPUT"], passes: ["display"] },
  ];
  expect(await attachedScripts()).toEqual(attached);
  expect((await caller.regex.listScripts()).length).toBe(scriptsBefore + 2);

  expect(await caller.preset.previewFile(file)).toMatchObject({ ok: true, inLibrary: true, regexScripts: 2 });
  expect(await caller.preset.importFile(file)).toMatchObject({ ok: true, created: false, presetId, regexScripts: { created: 0, reused: 2 } });

  // The folder door reads the same file under its own qualified name and finds an equal preset.
  const presetsBefore = await caller.preset.list();
  await finishRun(root, await admit(root, { [ST_SETTINGS_FILE]: settings({}), [`OpenAI Settings/${FILE_NAME}`]: PRESET_FILE }));
  expect(await caller.preset.list()).toEqual(presetsBefore);
  expect(await attachedScripts()).toEqual(attached);
  expect((await caller.regex.listScripts()).length).toBe(scriptsBefore + 2);
});
