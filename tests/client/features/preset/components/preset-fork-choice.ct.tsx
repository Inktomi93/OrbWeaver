// @subject packages/client/src/features/preset/components/preset-fork-choice-dialog.tsx
// @subject packages/client/src/components/commit-row.tsx
// The built-in's fork choice through the production editor: an edit to the built-in, with a fork already held, asks where it goes. The
// name stage's commit footer leaves by a Back that returns to the choice instead of closing, each stage takes focus where it swaps in,
// and the commit mints the fork under the typed name. The footer stays on screen at a phone, a landscape phone and a desktop, and at
// the largest browser text.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { PresetId } from "@orb/kit/ids";
import { PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  PRESET_EDITOR_VIEW_LABELS,
  PRESET_FORK_CREATE_NAME,
  PRESET_FORK_NAME_FIELD_NAME,
  PRESET_FORK_NAME_TITLE,
  PRESET_FORK_START_NAME,
} from "#client/features/preset/lib/preset-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "settings.updateUserSettingsSection",
  "preset.list",
  "preset.get",
  "preset.update",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;
const NEW_FORK = "Second campaign fork";
const APPEARANCE = appearanceSettingsSchema.parse({});

const VIEWPORTS = [
  { name: "a phone", viewport: { width: 390, height: 844 }, touch: true },
  { name: "a landscape phone", viewport: { width: 844, height: 390 }, touch: true },
  { name: "a desktop", viewport: { width: 1280, height: 800 }, touch: false },
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

interface BuiltIn {
  readonly presetId: PresetId;
  /** The names of the forks held before the dialog asks. */
  readonly forks: readonly string[];
}

/** The corpus owner's built-in, which already has a fork, so an edit to it asks. */
async function builtInWithFork(caller: Caller): Promise<BuiltIn> {
  const builtIn = (await caller.preset.list()).find((row) => row.isSystemDefault);
  if (builtIn === undefined) {
    throw new Error("The corpus has no built-in preset");
  }
  const forks = await forksOf(caller, builtIn.id);
  if (forks.length === 0) {
    throw new Error("The corpus owner holds no fork of the built-in preset");
  }
  return { presetId: builtIn.id, forks };
}

async function forksOf(caller: Caller, presetId: PresetId): Promise<readonly string[]> {
  return (await caller.preset.list())
    .filter((row) => row.forkedFrom === presetId)
    .map((row) => row.name)
    .toSorted();
}

/** Edit the built-in's first knob, which parks the write on the fork choice. */
async function editBuiltIn(page: Page): Promise<ReturnType<Page["getByRole"]>> {
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();
  const knob = page.locator('[data-slot="number-field-root"] input').first();
  await knob.fill("7");
  await knob.press("Tab");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: PRESET_FORK_START_NAME, exact: true })).toBeVisible();
  return dialog;
}

for (const { name, viewport, touch } of VIEWPORTS) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch: touch, isMobile: touch });

    for (const text of [PLATFORM_TEXT_SCALES[0], PLATFORM_TEXT_SCALES.at(-1) ?? PLATFORM_TEXT_SCALES[0]]) {
      test(`at ${String(text * 100)}% text the name stage goes Back to the choice and its commit mints the fork`, async ({ mount, page }) => {
        await using _text = await setPlatformTextSize(page, text);
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        const { presetId, forks } = await builtInWithFork(caller);
        await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
        await mount<typeof PresetActionGroupsStory>(STORY, { width: viewport.width, appearance: APPEARANCE, subject: "editor", presetId });

        const dialog = await editBuiltIn(page);
        const start = dialog.getByRole("button", { name: PRESET_FORK_START_NAME, exact: true });
        await start.click();
        const field = dialog.getByRole("textbox", { name: PRESET_FORK_NAME_FIELD_NAME, exact: true });
        await expect(dialog.getByRole("heading", { name: PRESET_FORK_NAME_TITLE, exact: true })).toBeVisible();
        await expect(field).toBeFocused();
        // The stage has no Cancel: its exit is a Back, and the commit sits beside it on screen.
        await expect(dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true })).toHaveCount(0);
        const back = dialog.getByRole("button", { name: DIALOG_VERBS.back, exact: true });
        const create = dialog.getByRole("button", { name: PRESET_FORK_CREATE_NAME, exact: true });
        await expect(back).toBeInViewport({ ratio: 1 });
        await expect(create).toBeInViewport({ ratio: 1 });

        await back.click();
        await expect(dialog).toBeVisible();
        await expect(start).toBeFocused();

        await start.click();
        await expect(create).toBeEnabled();
        await field.fill("");
        await expect(create).toBeDisabled();
        await field.fill(NEW_FORK);
        await create.click();
        await expect(dialog).toHaveCount(0);
        // The dialog closes on the answer, and the parked write lands after it.
        await expect.poll(() => forksOf(caller, presetId)).toEqual([...forks, NEW_FORK].toSorted());
      });
    }
  });
}

test("Escape on the name stage takes the choice's primary arm and mints nothing", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const { presetId, forks } = await builtInWithFork(caller);
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof PresetActionGroupsStory>(STORY, { width: 1280, appearance: APPEARANCE, subject: "editor", presetId });

  const dialog = await editBuiltIn(page);
  await dialog.getByRole("button", { name: PRESET_FORK_START_NAME, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await forksOf(caller, presetId)).toEqual(forks);
});
