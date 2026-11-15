// @subject packages/server/src/domain/preset/verbs/import-file.ts
// What the Presets page's preview says a SillyTavern preset holds is what the import then lands: the prompts and how many are on,
// the samplers and the limits, the scripts, and the settings with no equivalent, which never include the preset's own `name`.
import { buildPresetFile } from "@orb/contracts/preset";
import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
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

/** The prompts the file itself authors, in order, and whether it switches each on. */
const AUTHORED_SECTIONS = [
  { id: "main", enabled: true },
  { id: "lore", enabled: true },
  { id: "tone", enabled: false },
  { id: "extra", enabled: false },
];

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
  if (!preview.ok) {
    throw new Error("the preview refused the file");
  }
  // The import adds prompts of its own to a SillyTavern preset and switches them on, so they count with the file's.
  const added = preview.addedSections.length;
  expect(added).toBeGreaterThan(0);
  expect(preview).toMatchObject({
    format: "sillyTavern",
    name: PRESET_NAME,
    sectionCount: AUTHORED_SECTIONS.length + added,
    enabledCount: AUTHORED_SECTIONS.filter(({ enabled }) => enabled).length + added,
    samplerCount: 2,
    limitCount: 2,
    regexScripts: 2,
  });
  // `name` is used (the preset takes the file's name), so it is not listed; the two with no equivalent are.
  expect(preview.leftOut.map(({ field }) => field)).toEqual(["group_nudge_prompt", "wi_format"]);

  const imported = await caller.preset.importFile(file);
  if (!imported.ok || imported.presetId === undefined) {
    throw new Error("the import landed no preset");
  }
  expect(imported).toMatchObject({ created: true, name: PRESET_NAME, regexScripts: { created: 2, reused: 0 }, addedSections: preview.addedSections });
  const landed = await caller.preset.get({ id: imported.presetId });
  const addedLanded = landed.config.sections.filter(({ name }) => preview.addedSections.includes(name));
  expect(addedLanded.map(({ enabled }) => enabled)).toEqual(preview.addedSections.map(() => true));
  expect(landed.config.sections.filter(({ name }) => !preview.addedSections.includes(name)).map(({ id, enabled }) => ({ id, enabled }))).toEqual(
    AUTHORED_SECTIONS,
  );
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
    sectionCount: landed.config.sections.length,
    enabledCount: landed.config.sections.filter(({ enabled }) => enabled).length,
    samplerCount: 2,
    limitCount: 2,
    leftOut: [],
    regexScripts: 0,
    addedSections: [],
  });
});

// The wire value of SillyTavern's absolute-depth injection, and a depth past the largest this app stores.
const ST_ABSOLUTE_INJECTION = 1;
const SENT_DEPTH = MAX_INJECTION_DEPTH * 2;
const CLAMPED_FIELD = "prompts.main.injection_depth";
const CLAMPED_FILE = JSON.stringify({
  prompts: [
    {
      identifier: "main",
      name: "Main",
      content: "You narrate.",
      role: "system",
      ["injection_position"]: ST_ABSOLUTE_INJECTION,
      ["injection_depth"]: SENT_DEPTH,
    },
  ],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
});

test("a value the import brings into range is reported as changed with what it landed as, never as left out", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const file = { fileText: CLAMPED_FILE, fileName: FILE_NAME };

  const preview = await caller.preset.previewFile(file);
  if (!preview.ok) {
    throw new Error("the preview refused the file");
  }
  expect(preview.clamped).toEqual([{ field: CLAMPED_FIELD, sent: SENT_DEPTH, landedAs: MAX_INJECTION_DEPTH }]);
  expect(preview.leftOut).toEqual([]);

  const imported = await caller.preset.importFile(file);
  if (!imported.ok || imported.presetId === undefined) {
    throw new Error("the import landed no preset");
  }
  const landed = await caller.preset.get({ id: imported.presetId });
  expect(landed.config.sections.find(({ id }) => id === "main")).toMatchObject({ inject: { depth: MAX_INJECTION_DEPTH } });
});
