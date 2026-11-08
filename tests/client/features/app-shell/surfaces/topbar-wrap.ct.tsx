// The phone topbar gives the screen's name a line of its own only when one row cannot seat it. A screen whose trail holds
// no primary wraps at and below the cq-16 step, as it always has; a screen whose trail holds its primary (Characters' New)
// wraps from the wider cq-20 step, so the primary stays inline instead of folding. The reserved block height follows the wrap.
import { FONT_SCALE } from "@orb/kit/font-scale";
import { resolvedLength, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const PHONE_WIDTHS = [320, 360, 390, 430] as const;
const TEXT_SCALES = [1, 1.25, FONT_SCALE.max] as const;
const CHROME_ROW = `var(${TOKENS["dimension.chrome-row"].cssVar})`;
const STEP_16 = `var(${TOKENS["container.cq-16"].cssVar})`;
const STEP_20 = `var(${TOKENS["container.cq-20"].cssVar})`;
// A wrapped topbar is the chrome row plus half of one, which is the line the name takes.
const WRAPPED_ROWS = 1.5;

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

/** Whether the phone page at `width` is under the container step `expression`; `atStep` counts the step itself. */
async function underStep(page: Page, expression: string, width: number, atStep: boolean): Promise<boolean> {
  const step = await resolvedLength(page, expression);
  return atStep ? width <= step : width < step;
}

for (const section of ["chats", "config"] as const) {
  for (const width of PHONE_WIDTHS) {
    for (const scale of TEXT_SCALES) {
      test(`${section} at ${String(width)} and text ${String(scale)} wraps its topbar only at and below the cq-16 step`, async ({ mount, page }) => {
        await page.setViewportSize({ width, height: 844 });
        await seedShellState(page, { activeSection: section });
        await mount<typeof AppShellStory>(STORY, {});
        await setRootFontScale(page, channelName("fontScale"), scale);
        const row = await resolvedLength(page, CHROME_ROW);
        const wraps = await underStep(page, STEP_16, width, true);
        await expect.poll(async () => (await page.locator(".shell-topbar").boundingBox())?.height).toBeCloseTo(row * (wraps ? WRAPPED_ROWS : 1), 0);
      });
    }
  }
}

for (const width of PHONE_WIDTHS) {
  for (const scale of TEXT_SCALES) {
    test(`characters at ${String(width)} and text ${String(scale)} wraps its topbar below the cq-20 step, where its trail holds New`, async ({
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await setRootFontScale(page, channelName("fontScale"), scale);
      const row = await resolvedLength(page, CHROME_ROW);
      const wraps = await underStep(page, STEP_20, width, false);
      await expect.poll(async () => (await page.locator(".shell-topbar").boundingBox())?.height).toBeCloseTo(row * (wraps ? WRAPPED_ROWS : 1), 0);
    });
  }
}
