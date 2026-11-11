// What a SillyTavern profile's themes leave behind, as the operator reads it in the import report: each converted
// theme lists exactly the ST keys that found no orb seat, a theme that landed whole lists none, and a theme file the
// grammar cannot read is named with its reason. The ST key names are SillyTavern's own wire spellings, so they are input data.
// @subject packages/server/src/domain/import/verbs/import-themes.ts
// @subject packages/server/src/domain/import/substrate/report.ts
// @subject packages/server/src/primitives/serde/theme/st.ts

import { readFile } from "node:fs/promises";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { admit, finishRun, harness, settings } from "./_st-tree-door.ts";

const SURFACE = "rgba(16, 32, 64, 0.5)";

const FULL_THEME = {
  ["fast_ui_mode"]: true,
  name: "Azure",
  ["blur_tint_color"]: SURFACE,
  ["chat_tint_color"]: "rgba(0, 0, 0, 0.5)",
  ["user_mes_blur_tint_color"]: "rgba(248, 0, 0, 0.5)",
  ["bot_mes_blur_tint_color"]: "rgba(64, 64, 128, 0.5)",
  ["main_text_color"]: "rgb(255, 255, 255)",
  ["italics_text_color"]: "#c0c0ff",
  ["quote_text_color"]: "rgb(255 200 100)",
  ["border_color"]: "rgba(248, 248, 248, 0.5)",
  ["custom_css"]: "#chat { color: red; }",
  ["font_scale"]: 1.2,
  ["shadow_width"]: 2,
  // Present with no meaningful value: the report skips each of these.
  ["blur_strength"]: 0,
  ["noShadows"]: false,
  ["toastr_position"]: "  ",
  // Not a key orb has a reason for: nothing to report it under.
  ["vendor_extra"]: "kept by nobody",
};

/** The markdown report a real import of `files` wrote for the operator. */
async function importReport(root: ServerTestHarness, files: Readonly<Record<string, string>>): Promise<string> {
  const result = await finishRun(root, await admit(root, { [ST_SETTINGS_FILE]: settings({}), ...files }));
  if (result.reportPath === undefined) {
    throw new Error("the real run did not expose its written report");
  }
  return await readFile(result.reportPath, "utf8");
}

/** The ST keys the report lists under one converted theme. The theme's own line must be there, so a report that
 *  never reached the theme fails instead of reading as "nothing left over". */
function unmappedFieldsOf(report: string, themeName: string): readonly string[] {
  const lines = report.split("\n");
  const head = lines.findIndex((line) => line.startsWith(`- \`${themeName}\` (from `));
  if (head === -1) {
    throw new Error(`the report carries no note for ${themeName}`);
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

test("a converted theme's report lists exactly the ST keys that found no orb seat, in the grammar's own order; a whole-landing theme lists none", async () => {
  await using root = await harness();

  const report = await importReport(root, {
    "themes/Azure.json": JSON.stringify(FULL_THEME),
    "themes/Plain.json": JSON.stringify({ name: "Plain", ["blur_tint_color"]: "rgb(16, 32, 64)" }),
  });

  // The chat panel is consumed as the backdrop and still listed, because it emits no token.
  expect(unmappedFieldsOf(report, "Azure (SillyTavern)")).toEqual(["chat_tint_color", "shadow_width", "custom_css", "font_scale", "fast_ui_mode"]);
  expect(unmappedFieldsOf(report, "Plain (SillyTavern)")).toEqual([]);
});

test("a text colour dropped as unsafe is reported under its own ST key, and the colours that pass are not", async () => {
  await using root = await harness();

  const report = await importReport(root, {
    "themes/Dim.json": JSON.stringify({
      name: "Dim",
      ["blur_tint_color"]: "rgb(16, 32, 64)",
      ["main_text_color"]: "rgb(40, 50, 80)",
      ["italics_text_color"]: "rgb(255, 255, 255)",
    }),
  });

  expect(unmappedFieldsOf(report, "Dim (SillyTavern)")).toEqual(["main_text_color"]);
});

test("a theme file with no readable base surface is named in the report with the keys it looked for, and the other themes still land", async () => {
  await using root = await harness();

  const report = await importReport(root, {
    "themes/Bad.json": JSON.stringify({ name: "Bad", ["main_text_color"]: "rgb(255, 255, 255)" }),
    "themes/Plain.json": JSON.stringify({ name: "Plain", ["blur_tint_color"]: "rgb(16, 32, 64)" }),
  });

  const refused = report.split("\n").find((line) => line.startsWith("- `themes/Bad.json` — "));
  expect(refused).toMatch(/blur_tint_color.*chat_tint_color/u);
  // The control: the refusal did not stop the wave, so the neighbour has its own note.
  expect(unmappedFieldsOf(report, "Plain (SillyTavern)")).toEqual([]);
  expect(report).not.toContain("`Bad (SillyTavern)`");
});
