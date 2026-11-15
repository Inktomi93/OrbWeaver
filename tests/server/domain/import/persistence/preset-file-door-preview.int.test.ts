// @subject packages/server/src/domain/preset/verbs/import-file.ts
// What the Presets page's preview says a SillyTavern preset holds is what the import then lands: the prompts and how many are on,
// the samplers and the limits, the scripts, and the settings with no equivalent, which never include the preset's own `name`.
import { buildPresetFile } from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node";
import { harness } from "./_st-tree-door.ts";

const FILE_NAME = "Harbour Tone.json";
const PRESET_NAME = "Harbour Tone";
const ST_AI_OUTPUT = 2;
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

// SillyTavern wire text is snake_case by spec, so the preset is raw JSON: four prompts with two switched on, two
// samplers, both limits, two regex scripts and two settings this app has no equivalent for.
const PRESET_FILE = JSON.stringify({
  name: "Inner name",
  prompts: [
    { identifier: "main", name: "Main", content: "You narrate.", role: "system" },
    { identifier: "lore", name: "Lore", content: "The harbour is cold.", role: "system" },
    { identifier: "tone", name: "Tone", content: "Keep it spare.", role: "system" },
    { identifier: "extra", name: "Extra", content: "Rarely wanted.", role: "system" },
  ],
  ["prompt_order"]: [
    {
      ["character_id"]: 100_001,
      order: [
        { identifier: "main", enabled: true },
        { identifier: "lore", enabled: true },
        { identifier: "tone", enabled: false },
        { identifier: "extra", enabled: false },
      ],
    },
  ],
  temperature: 0.7,
  ["top_p"]: 0.9,
  ["openai_max_context"]: 32_000,
  ["openai_max_tokens"]: 800,
  ["group_nudge_prompt"]: "Keep the group moving.",
  ["wi_format"]: "{0}",
  extensions: {
    ["regex_scripts"]: [
      { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000021", scriptName: "Status panel", findRegex: "<status>", replaceString: "<div>status</div>" },
      { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000022", scriptName: "Mood panel", findRegex: "<mood>", replaceString: "<div>mood</div>" },
    ],
  },
});

test("the preview counts what the import lands: prompts and those on, samplers, limits and scripts, and names no used field as dropped", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const file = { fileText: PRESET_FILE, fileName: FILE_NAME };

  const preview = await caller.preset.previewFile(file);
  expect(preview).toMatchObject({
    ok: true,
    format: "sillyTavern",
    name: PRESET_NAME,
    sectionCount: 4,
    enabledCount: 2,
    samplerCount: 2,
    limitCount: 2,
    regexScripts: 2,
  });
  // `name` is used (the preset takes the file's name), so it is not listed; the two with no equivalent are.
  expect(preview.ok ? preview.leftOut.map(({ field }) => field) : []).toEqual(["group_nudge_prompt", "wi_format"]);

  const imported = await caller.preset.importFile(file);
  if (!imported.ok || imported.presetId === undefined) {
    throw new Error("the import landed no preset");
  }
  expect(imported).toMatchObject({ created: true, name: PRESET_NAME, regexScripts: { created: 2, reused: 0 } });
  const landed = await caller.preset.get({ id: imported.presetId });
  expect(landed.config.sections.map(({ id, enabled }) => ({ id, enabled }))).toEqual([
    { id: "main", enabled: true },
    { id: "lore", enabled: true },
    { id: "tone", enabled: false },
    { id: "extra", enabled: false },
  ]);
  expect(landed.config.params).toMatchObject({ temperature: 0.7, topP: 0.9, maxContextTokens: 32_000, maxOutputTokens: 800 });
});

test("an orbweaver export previews the same counts it lands with", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const source = await caller.preset.importFile({ fileText: PRESET_FILE, fileName: FILE_NAME });
  if (!source.ok || source.presetId === undefined) {
    throw new Error("the source preset landed no row");
  }
  // The Presets page exports client-side, through the contract's own file builder.
  const landed = await caller.preset.get({ id: source.presetId });
  const exported = JSON.stringify(buildPresetFile(landed.name, landed.config));
  const preview = await caller.preset.previewFile({ fileText: exported, fileName: "Harbour Tone export.json" });
  expect(preview).toMatchObject({
    ok: true,
    format: "orbweaver",
    sectionCount: 4,
    enabledCount: 2,
    samplerCount: 2,
    limitCount: 2,
    leftOut: [],
    regexScripts: 0,
  });
});
