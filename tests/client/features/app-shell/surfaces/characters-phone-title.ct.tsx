// The phone topbar of a roster screen: the screen's name stays whole beside the trail at the narrowest phone widths and at
// the app's own text scales, and Characters keeps New in the trail as an icon while Import folds into the trail's menu.
// The shell's own stylesheet and row measures decide this.
import { FONT_SCALE } from "@orb/kit/font-scale";
import { seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import { CHARACTER_NEW_NAME } from "#client/features/character/lib/character-names.ts";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const TITLE = '.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title';
const TRAIL = ".shell-topbar-trail";
const PHONE_WIDTHS = [320, 360, 390, 430] as const;
// Default text, a step in the app's range, and its top: the widest the name is ever set.
const TEXT_SCALES = [1, 1.25, FONT_SCALE.max] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test.use({ hasTouch: true, isMobile: true });

/** Whether the name's text fits its box: the name is the title's floor, so the row cuts the census before a letter of it. */
function nameIsWhole(name: Locator): Promise<boolean> {
  return name.evaluate((element) => element.scrollWidth <= element.clientWidth);
}

for (const width of PHONE_WIDTHS) {
  for (const scale of TEXT_SCALES) {
    test(`characters at ${String(width)} and text ${String(scale)} prints its whole name and keeps New in the trail`, async ({ mount, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await setRootFontScale(page, channelName("fontScale"), scale);
      const name = page.locator(TITLE).locator(".shell-topbar-title-name");
      await expect(name).toHaveText(SECTION_LABELS.characters);
      await expect.poll(() => nameIsWhole(name)).toBe(true);
      await expect(page.locator(TRAIL).getByRole("button", { name: CHARACTER_NEW_NAME, exact: true })).toBeVisible();
    });
  }
}

for (const width of PHONE_WIDTHS) {
  for (const scale of TEXT_SCALES) {
    test(`presets at ${String(width)} and text ${String(scale)} prints its whole name`, async ({ mount, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await seedShellState(page, { activeSection: "presets" });
      await mount<typeof AppShellStory>(STORY, {});
      await setRootFontScale(page, channelName("fontScale"), scale);
      const name = page.locator(TITLE).locator(".shell-topbar-title-name");
      await expect(name).toHaveText(SECTION_LABELS.presets);
      await expect.poll(() => nameIsWhole(name)).toBe(true);
    });
  }
}
