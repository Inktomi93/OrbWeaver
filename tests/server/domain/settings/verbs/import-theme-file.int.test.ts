// A raw SillyTavern theme file through the single-theme import door: each mapped ST key lands in its own field of the
// stored theme, the colour rules flatten and convert as the grammar states, and a file the grammar cannot read is
// refused with a reason and lands nothing. The ST key names are SillyTavern's own wire spellings, so they are input data.
// @subject packages/server/src/domain/settings/verbs/import-theme-file.ts
// @subject packages/server/src/domain/settings/verbs/import-theme.ts
// @subject packages/server/src/primitives/serde/theme/st.ts

import type { ThemeOverride } from "@orb/contracts/theme";
import { themeOverrideSchema } from "@orb/contracts/theme";
import type { Oklch } from "@orb/kit/theme-derivation";
import { oklchToSrgb } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

const FILENAME = "azure.json";
const QUALIFIER = "(SillyTavern)";
// The surface is (16 32 64) once its alpha is dropped; the chat panel is black at 0.5 over it, so it reads (8 16 32).
const SURFACE = "rgba(16, 32, 64, 0.5)";
const CHAT_PANEL = "rgba(0, 0, 0, 0.5)";

const FULL_THEME = {
  ["fast_ui_mode"]: true,
  name: "Azure",
  ["blur_tint_color"]: SURFACE,
  ["chat_tint_color"]: CHAT_PANEL,
  // Each translucent tint composites onto the panel: 0.5 * tint + 0.5 * (8 16 32).
  ["user_mes_blur_tint_color"]: "rgba(248, 0, 0, 0.5)",
  ["bot_mes_blur_tint_color"]: "rgba(64, 64, 128, 0.5)",
  ["main_text_color"]: "rgb(255, 255, 255)",
  ["italics_text_color"]: "#c0c0ff",
  ["quote_text_color"]: "rgb(255 200 100)",
  ["border_color"]: "rgba(248, 248, 248, 0.5)",
  ["custom_css"]: "#chat { color: red; }",
  ["font_scale"]: 1.2,
  ["shadow_width"]: 2,
  ["blur_strength"]: 0,
  ["noShadows"]: false,
  ["vendor_extra"]: "kept by nobody",
};

async function callerOf(harness: ServerTestHarness): Promise<Caller> {
  return await harness.internalCallerFor((await harness.actor()).id);
}

/** Import `theme` as a file and read the landed theme back through the production list verb. */
async function importAndRead(caller: Caller, theme: object, filename = FILENAME): Promise<{ readonly name: string; readonly override: ThemeOverride }> {
  const landing = await caller.settings.importThemeFile({ fileText: JSON.stringify(theme), filename });
  const stored = (await caller.settings.listThemes()).find((row) => row.name === landing.name);
  if (stored === undefined) {
    throw new Error(`the import landed ${landing.name}, but the library does not list it`);
  }
  return stored;
}

const OKLCH_LITERAL = /^oklch\((\d(?:\.\d+)?) (\d(?:\.\d+)?) (\d+(?:\.\d+)?)\)$/u;

/** The whole sRGB channels a stored `oklch()` literal denotes, by the kit's inverse conversion. A pinned literal is
 *  checked against this, so it is the colour the ST key spelled and not whatever the mapper happened to emit. */
function channelsOf(literal: string | undefined): readonly number[] {
  const match = literal === undefined ? null : OKLCH_LITERAL.exec(literal);
  if (match === null) {
    throw new Error(`not an oklch literal: ${String(literal)}`);
  }
  const color: Oklch = { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
  const { r, g, b } = oklchToSrgb(color);
  // Gamut noise can land a hair under zero; the clamp also keeps a negative zero out of the comparison.
  return [r, g, b].map((channel) => Math.max(0, Math.round(channel)));
}

test("every mapped ST key lands in its own field of the stored theme", async ({ harness }) => {
  const caller = await callerOf(harness);

  const stored = await importAndRead(caller, FULL_THEME);

  expect(stored.name).toBe(`Azure ${QUALIFIER}`);
  const expected = {
    background: "oklch(0.2493 0.0645 262.64)",
    bodyColor: "oklch(1.0000 0.0000 0.00)",
    narrationColor: "oklch(0.8298 0.0879 284.32)",
    dialogueColor: "oklch(0.8628 0.1326 80.39)",
    userBubble: { bg: "oklch(0.3817 0.1494 26.21)" },
    aiBubble: { bg: "oklch(0.2956 0.0721 276.74)" },
    borderColor: "oklch(0.6126 0.0129 264.47)",
  } satisfies ThemeOverride;
  expect(stored.override).toEqual(expected);
  expect(channelsOf(stored.override.background)).toEqual([16, 32, 64]);
  expect(channelsOf(stored.override.bodyColor)).toEqual([255, 255, 255]);
  expect(channelsOf(stored.override.narrationColor)).toEqual([192, 192, 255]);
  expect(channelsOf(stored.override.dialogueColor)).toEqual([255, 200, 100]);
  expect(channelsOf(stored.override.userBubble?.bg)).toEqual([128, 8, 16]);
  expect(channelsOf(stored.override.aiBubble?.bg)).toEqual([36, 40, 80]);
  expect(channelsOf(stored.override.borderColor)).toEqual([128, 132, 140]);
  // The wire clamp keeps every field, so each stored value is one the renderer accepts.
  expect(themeOverrideSchema.parse(stored.override)).toEqual(stored.override);
});

test("a theme without a name of its own is named from the file's stem, and an unset mapped key stays unset", async ({ harness }) => {
  const caller = await callerOf(harness);

  const stored = await importAndRead(caller, { ["blur_tint_color"]: "rgb(16, 32, 64)" }, "dusk.json");

  expect(stored.name).toBe(`dusk ${QUALIFIER}`);
  expect(Object.keys(stored.override)).toEqual(["background"]);
});

test("a hex colour with an alpha byte reads as its rgb channels, and the base surface drops that alpha instead of compositing it", async ({ harness }) => {
  const caller = await callerOf(harness);

  const stored = await importAndRead(caller, { name: "Hex", ["blur_tint_color"]: "#10204080" });

  expect(channelsOf(stored.override.background)).toEqual([16, 32, 64]);
});

test("sRGB red converts to its CSS Color 4 OKLCH value", async ({ harness }) => {
  const caller = await callerOf(harness);

  const stored = await importAndRead(caller, { name: "Red", ["blur_tint_color"]: "#ff0000" });

  // oklch(62.8% 0.2577 29.23) is the CSS Color 4 reference for #ff0000, a value this suite did not compute.
  expect(stored.override.background).toBe("oklch(0.6280 0.2577 29.23)");
});

test("a translucent tint is flattened over the chat panel, or over the surface when there is no panel", async ({ harness }) => {
  const caller = await callerOf(harness);
  const tint = { ["blur_tint_color"]: "rgb(16, 32, 64)", ["user_mes_blur_tint_color"]: "rgba(248, 0, 0, 0.5)" };

  const overPanel = await importAndRead(caller, { ...tint, name: "Panel", ["chat_tint_color"]: CHAT_PANEL });
  const overSurface = await importAndRead(caller, { ...tint, name: "Bare" });

  // 0.5 * (248 0 0) over the panel (8 16 32) is (128 8 16); over the surface (16 32 64) it is (132 16 32).
  expect(channelsOf(overPanel.override.userBubble?.bg)).toEqual([128, 8, 16]);
  expect(channelsOf(overSurface.override.userBubble?.bg)).toEqual([132, 16, 32]);
  // The panel only backs the tints: it moves no base surface and emits no token of its own.
  expect(overPanel.override.background).toBe(overSurface.override.background);
  expect(Object.keys(overPanel.override).toSorted()).toEqual(["background", "userBubble"]);
});

test("a translucent text colour is flattened over the chat panel before it is measured and kept", async ({ harness }) => {
  const caller = await callerOf(harness);

  const stored = await importAndRead(caller, {
    name: "Ink",
    ["blur_tint_color"]: "rgb(16, 32, 64)",
    ["chat_tint_color"]: CHAT_PANEL,
    ["main_text_color"]: "rgba(248, 248, 248, 0.75)",
  });

  // 0.75 * (248 248 248) + 0.25 * (8 16 32) is (188 190 194), which clears AA on the (16 32 64) surface.
  expect(channelsOf(stored.override.bodyColor)).toEqual([188, 190, 194]);
});

test("a chat panel alone stands in for the base surface, opaque", async ({ harness }) => {
  const caller = await callerOf(harness);

  const stored = await importAndRead(caller, { name: "Panel only", ["chat_tint_color"]: "rgba(16, 32, 64, 0.5)" });

  expect(channelsOf(stored.override.background)).toEqual([16, 32, 64]);
});

test("an authored text colour that fails AA against its surface is left off the theme, and the ones that pass stay", async ({ harness }) => {
  const caller = await callerOf(harness);

  const stored = await importAndRead(caller, {
    name: "Dim",
    ["blur_tint_color"]: "rgb(16, 32, 64)",
    ["main_text_color"]: "rgb(40, 50, 80)",
    ["italics_text_color"]: "rgb(255, 255, 255)",
  });

  expect(stored.override.bodyColor).toBeUndefined();
  expect(channelsOf(stored.override.narrationColor)).toEqual([255, 255, 255]);
});

test("a file the grammar cannot read is refused, lands nothing, and the same text with a readable surface lands", async ({ harness }) => {
  const caller = await callerOf(harness);
  const landedBefore = (await caller.settings.listThemes()).length;
  const refusals = [
    { fileText: "[1, 2]" },
    { fileText: "not json at all" },
    { fileText: JSON.stringify({ name: "No surface", ["main_text_color"]: "rgb(255, 255, 255)" }) },
    { fileText: JSON.stringify({ name: "Unreadable", ["blur_tint_color"]: "red", ["chat_tint_color"]: "var(--chat)" }) },
  ];

  for (const file of refusals) {
    await expect(caller.settings.importThemeFile(file)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }
  // The grammar's own refusal names the keys it looked for a base surface in.
  await expect(caller.settings.importThemeFile({ fileText: JSON.stringify({ ["main_text_color"]: "rgb(255, 255, 255)" }) })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: expect.stringMatching(/blur_tint_color.*chat_tint_color/u),
  });
  expect((await caller.settings.listThemes()).length).toBe(landedBefore);

  // The control: the refused file's own text plus one readable surface lands.
  const landed = await importAndRead(caller, { name: "No surface", ["main_text_color"]: "rgb(255, 255, 255)", ["blur_tint_color"]: "rgb(16, 32, 64)" });
  expect(landed.name).toBe(`No surface ${QUALIFIER}`);
  expect((await caller.settings.listThemes()).length).toBe(landedBefore + 1);
});
