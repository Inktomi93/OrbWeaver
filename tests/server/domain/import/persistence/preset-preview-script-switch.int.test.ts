// The Presets preview counts the attached scripts that come in switched off as the run attaches them: a script the
// owner already holds is reused with its library row's own switch, whatever the file says, and a new one takes the
// file's.
// @subject packages/server/src/domain/regex/substrate/dedup.ts
// @subject packages/server/src/domain/preset/verbs/import-file.ts

import { expect, test } from "@orb/testkit/node";
import { harness } from "./_st-tree-door.ts";

const ST_AI_OUTPUT = 2;

// SillyTavern wire text is snake_case and integer placements by spec, so the files are raw JSON.
const lamp = (disabled: boolean): Record<string, unknown> => ({
  id: "c0ffee00-0000-4000-8000-000000000201",
  scriptName: "Lamp",
  findRegex: "<lamp>",
  replaceString: "<b>lamp</b>",
  trimStrings: [],
  placement: [ST_AI_OUTPUT],
  disabled,
  markdownOnly: true,
  promptOnly: false,
  runOnEdit: false,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
});

// Each file's own prompt text makes it its own preset, so only the script is shared.
const presetFile = (text: string, disabled: boolean): string =>
  JSON.stringify({
    prompts: [{ identifier: "main", name: "Main", content: text, role: "system" }],
    ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
    extensions: { ["regex_scripts"]: [lamp(disabled)] },
  });

type Root = Awaited<ReturnType<typeof harness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

/** The preview's off count for a file, and the off count of the rows the run then attaches to its preset. */
async function previewAndRun(caller: Caller, fileText: string, fileName: string): Promise<{ readonly previewed: number; readonly attached: number }> {
  const preview = await caller.preset.previewFile({ fileText, fileName });
  if (!preview.ok) {
    throw new Error(preview.error);
  }
  const outcome = await caller.preset.importFile({ fileText, fileName });
  if (!outcome.ok || outcome.presetId === undefined) {
    throw new Error("the Presets page landed no preset");
  }
  const rows = await caller.regex.listForPreset({ presetId: outcome.presetId });
  return { previewed: preview.regexScriptsOff, attached: rows.filter(({ enabled }) => !enabled).length };
}

test("a file that sets a held script off previews it on, as the run reuses the owner's switched-on row", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.preset.importFile({ fileText: presetFile("You keep the lamp.", false), fileName: "First.json" });

  expect(await previewAndRun(caller, presetFile("You tend the lamp.", true), "Second.json")).toEqual({ previewed: 0, attached: 0 });
});

test("a file that sets a held script on previews it off, as the run reuses the owner's switched-off row", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.preset.importFile({ fileText: presetFile("You keep the lamp.", false), fileName: "First.json" });
  const held = (await caller.regex.listScripts()).find(({ name }) => name === "Lamp");
  if (held === undefined) {
    throw new Error("the first import holds no Lamp script");
  }
  await caller.regex.bulkSetEnabled({ scriptIds: [held.id], enabled: false });

  expect(await previewAndRun(caller, presetFile("You tend the lamp.", false), "Second.json")).toEqual({ previewed: 1, attached: 1 });
});

test("a new script takes the file's switch in the preview and the run", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);

  expect(await previewAndRun(caller, presetFile("You keep the lamp.", true), "First.json")).toEqual({ previewed: 1, attached: 1 });
});
