// The Presets import for a first user who arrives with a SillyTavern preset: the empty state offers Import beside New, the
// preview says what the file holds and what has no equivalent, a landed preset says whether it is in use and offers the one
// call that makes it so, and the preview stays reachable at 200% text. The band's own door is held at the shell's widths in
// tests/client/features/app-shell/surfaces/list-band-import-door.ct.tsx.
// @subject packages/client/src/features/preset/hooks/use-preset-import.tsx
// @subject packages/client/src/features/preset/components/preset-import-dialog.tsx
// @subject packages/client/src/features/preset/components/preset-library-welcome.tsx

import { setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, noticeToast, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import {
  NEW_PRESET_NAME,
  PRESET_IMPORT_ALREADY_HELD,
  PRESET_IMPORT_DROPPED_HEADING,
  PRESET_IMPORT_DROPPED_REGION_NAME,
  PRESET_IMPORT_IN_USE,
  PRESET_IMPORT_LANDED,
  PRESET_IMPORT_NAME,
  PRESET_IMPORT_NOT_IN_USE,
  PRESET_IMPORT_TITLE,
  PRESET_USE_THIS_NAME,
  presetImportCarried,
  presetImportLead,
  presetImportScripts,
  presetImportScriptsComing,
} from "#client/features/preset/lib/preset-names.ts";
import type { PresetImportDoorStory } from "./_preset-import-door-stories.tsx";

const STORY = "tests/client/features/preset/hooks/_preset-import-door-stories/PresetImportDoorStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "settings.updateUserSettingsSection",
  "preset.list",
  "preset.get",
  "preset.resolveEffective",
  "preset.previewFile",
  "preset.importFile",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;
const EMPTY_STATE = '[data-slot="empty-state-root"]';
const BAND_ACTIONS = '[data-slot="list-pane-action"]';

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

// A small synthetic SillyTavern preset. SillyTavern wire text is snake_case by spec, so it is raw JSON: four prompts with two
// switched on, two samplers, both limits, two regex scripts, and the settings this app has no equivalent for that the case
// names. It carries an inner `name`, which the preset ignores in favour of the file's.
function presetFile(unmapped: readonly string[]): string {
  return JSON.stringify({
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
    ...Object.fromEntries(unmapped.map((field) => [field, "on"])),
    extensions: {
      ["regex_scripts"]: [
        { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000031", scriptName: "Status panel", findRegex: "<status>", replaceString: "<div>status</div>" },
        { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000032", scriptName: "Mood panel", findRegex: "<mood>", replaceString: "<div>mood</div>" },
      ],
    },
  });
}

const PRESET_COUNTS = { prompts: 4, enabled: 2, samplers: 2, limits: 2, scripts: 2 } as const;
const ONE_UNMAPPED = ["wi_format"] as const;
const MANY_UNMAPPED = [
  "send_if_empty",
  "wi_format",
  "scenario_format",
  "personality_format",
  "stream_openai",
  "use_sysprompt",
  "media_inlining",
  "n",
  "group_nudge_prompt",
  "new_group_chat_prompt",
  "new_example_chat_prompt",
  "bias_preset_selected",
  "assistant_prefill",
  "assistant_impersonation",
  "wrap_in_quotes",
  "function_calling",
  "enable_web_search",
  "continue_prefill",
  "squash_system_messages",
  "names_behavior",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;

async function serve(page: Page, root: Harness): Promise<void> {
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), READS));
}

/** The empty state's Import beside New: where a first user with no preset yet meets it. */
function welcomeDoor(page: Page): Locator {
  return page.locator(EMPTY_STATE).getByRole("button", { name: PRESET_IMPORT_TITLE, exact: true });
}

/** The band's Import: still there once a preset is open and the welcome has gone. */
function bandDoor(page: Page): Locator {
  return page.locator(BAND_ACTIONS).getByRole("button", { name: PRESET_IMPORT_TITLE, exact: true });
}

async function pickFile(page: Page, door: Locator, text: string): Promise<void> {
  await door.click();
  const dialog = page.getByRole("dialog", { name: PRESET_IMPORT_TITLE, exact: true });
  await dialog.locator('input[type="file"]').setInputFiles({ name: FILE_NAME, mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(dialog.getByRole("button", { name: PRESET_IMPORT_NAME, exact: true })).toBeEnabled();
}

test("the empty state offers Import a preset beside New preset, and the door opens the import dialog", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await page.setViewportSize({ width: 1280, height: 900 });
  await serve(page, root);
  await mount<typeof PresetImportDoorStory>(STORY, {});
  await expect(page.locator(EMPTY_STATE).getByRole("button", { name: NEW_PRESET_NAME, exact: true })).toBeVisible();
  await expect(welcomeDoor(page)).toBeVisible();
  await welcomeDoor(page).click();
  await expect(page.getByRole("dialog", { name: PRESET_IMPORT_TITLE, exact: true })).toBeVisible();
});

test("the preview counts the prompts and those enabled, says samplers and limits came across, counts the scripts, and lists only what has no equivalent", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  await page.setViewportSize({ width: 1280, height: 900 });
  await serve(page, root);
  await mount<typeof PresetImportDoorStory>(STORY, {});
  await pickFile(page, welcomeDoor(page), presetFile(ONE_UNMAPPED));
  const dialog = page.getByRole("dialog", { name: PRESET_IMPORT_TITLE, exact: true });
  await expect(dialog.getByText(presetImportLead(true, PRESET_NAME, PRESET_COUNTS.prompts, PRESET_COUNTS.enabled), { exact: true })).toBeVisible();
  await expect(dialog.getByText(presetImportCarried(PRESET_COUNTS.samplers, PRESET_COUNTS.limits), { exact: true })).toBeVisible();
  await expect(dialog.getByText(presetImportScriptsComing(PRESET_COUNTS.scripts), { exact: true })).toBeVisible();
  await expect(dialog.getByText(PRESET_IMPORT_DROPPED_HEADING, { exact: true })).toBeVisible();
  const left = dialog.getByRole("region", { name: PRESET_IMPORT_DROPPED_REGION_NAME, exact: true });
  // The unmapped field is the positive control: the list names it, and `name`, which the preset used, is not in it.
  await expect(left.locator("code", { hasText: /^wi_format$/u })).toBeVisible();
  await expect(left.locator("code", { hasText: /^name$/u })).toHaveCount(0);
  // The dropzone names the picked file.
  await expect(dialog.getByText(FILE_NAME, { exact: true })).toBeVisible();
});

test("a landed preset says it is not in use and Use this preset activates it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await page.setViewportSize({ width: 1280, height: 900 });
  await serve(page, root);
  await mount<typeof PresetImportDoorStory>(STORY, {});

  await pickFile(page, welcomeDoor(page), presetFile(ONE_UNMAPPED));
  await page.getByRole("dialog", { name: PRESET_IMPORT_TITLE, exact: true }).getByRole("button", { name: PRESET_IMPORT_NAME, exact: true }).click();
  const landed = (await caller.preset.list()).find(({ name }) => name === PRESET_NAME);
  if (landed === undefined) {
    throw new Error("the import landed no preset");
  }
  // The scripts line rides the title: both scripts are attached and new to the library.
  const notInUse = noticeToast(page, {
    title: `${PRESET_IMPORT_LANDED} ${presetImportScripts(PRESET_COUNTS.scripts, PRESET_COUNTS.scripts)}`,
    description: PRESET_IMPORT_NOT_IN_USE,
  });
  await expect(notInUse).toBeVisible();
  // Not active yet: the control for the read-back below.
  expect((await caller.settings.getUserSettings()).config.seeds.defaultPresetId).not.toBe(landed.id);

  await notInUse.getByRole("button", { name: PRESET_USE_THIS_NAME, exact: true }).click();
  await expect.poll(async () => (await caller.settings.getUserSettings()).config.seeds.defaultPresetId).toBe(landed.id);
});

test("importing a file the library holds, which is the active preset, says it is the active one and offers nothing to activate", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const held = await caller.preset.importFile({ fileText: presetFile(ONE_UNMAPPED), fileName: FILE_NAME });
  if (!held.ok || held.presetId === undefined) {
    throw new Error("the first import landed no preset");
  }
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: held.presetId } });
  await page.setViewportSize({ width: 1280, height: 900 });
  await serve(page, root);
  await mount<typeof PresetImportDoorStory>(STORY, {});

  await pickFile(page, welcomeDoor(page), presetFile(ONE_UNMAPPED));
  await page.getByRole("dialog", { name: PRESET_IMPORT_TITLE, exact: true }).getByRole("button", { name: PRESET_IMPORT_NAME, exact: true }).click();
  // The same file again reuses the preset and its scripts, so nothing is new to the library.
  const inUse = noticeToast(page, {
    title: `${PRESET_IMPORT_ALREADY_HELD} ${presetImportScripts(PRESET_COUNTS.scripts, 0)}`,
    description: PRESET_IMPORT_IN_USE,
  });
  await expect(inUse).toBeVisible();
  await expect(inUse.getByRole("button", { name: PRESET_USE_THIS_NAME, exact: true })).toHaveCount(0);
});

test("at 200% text the preview's sentences stay whole and the long list of left-out settings scrolls in a region that shows it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await page.setViewportSize({ width: 640, height: 400 });
  await serve(page, root);
  await mount<typeof PresetImportDoorStory>(STORY, {});
  await setRootFontScale(page, FONT_SCALE_PROPERTY, 2);
  // At 200% the welcome sits below the first screen, so the file arrives through the band's door.
  await pickFile(page, bandDoor(page), presetFile(MANY_UNMAPPED));
  const dialog = page.getByRole("dialog", { name: PRESET_IMPORT_TITLE, exact: true });
  const lead = dialog.getByText(presetImportLead(true, PRESET_NAME, PRESET_COUNTS.prompts, PRESET_COUNTS.enabled), { exact: true });
  await lead.scrollIntoViewIfNeeded();
  await expect(lead).toBeInViewport({ ratio: 1 });
  const left = dialog.getByRole("region", { name: PRESET_IMPORT_DROPPED_REGION_NAME, exact: true });
  await left.scrollIntoViewIfNeeded();
  // The list is longer than its region, and the region draws its scrollbar thumb: the cue that more is below.
  expect(await left.evaluate((region) => region.scrollHeight > region.clientHeight)).toBe(true);
  await expect(dialog.locator('[data-slot="scroll-area-thumb-vertical"]')).toBeVisible();
});
