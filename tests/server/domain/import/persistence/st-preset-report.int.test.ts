// What a SillyTavern preset leaves behind, as the operator reads it in the import report: every top-level field with a
// value that found no orb seat is named, a field with no value is not, and the preset's own extension keys are named
// under `extensions` rather than as one opaque field. The ST key names are SillyTavern's own wire spellings, so they are
// input data.
// @subject packages/contracts/src/preset/index.ts
// @subject packages/server/src/domain/import/substrate/preset.ts
// @subject packages/server/src/domain/import/substrate/report.ts

import { readFile } from "node:fs/promises";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import { admit, finishRun, harness, settings } from "./_st-tree-door.ts";

/** The ST fields the report lists under one imported preset. The preset's own line must be there, so a report that
 *  never reached the preset fails instead of reading as "nothing left over". */
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

test("a preset's populated fields that orb neither maps nor lists are each named in the report, and its empty ones are not", async () => {
  await using root = await harness();
  const preset = {
    prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
    ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
    temperature: 0.8,
    ["stream_openai"]: true,
    ["wi_format"]: "{0}",
    ["max_context_unlocked"]: false,
    ["send_if_empty"]: "",
    extensions: { ["regex_scripts"]: [], ["vendor_panel"]: { on: true } },
  };

  const result = await finishRun(root, await admit(root, { [ST_SETTINGS_FILE]: settings({}), "OpenAI Settings/Sola.json": JSON.stringify(preset) }));
  if (result.reportPath === undefined) {
    throw new Error("the real run did not expose its written report");
  }

  expect(unmappedFieldsOf(await readFile(result.reportPath, "utf8"), "Sola (OpenAI)")).toEqual(["stream_openai", "wi_format", "extensions.vendor_panel"]);
});
