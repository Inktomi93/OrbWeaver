// The phone Characters topbar: the screen's name stays whole beside the trail at the narrowest phone widths, and the
// trail keeps New as an icon while Import folds into its menu. The shell's own stylesheet and row measures decide this.
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHARACTER_NEW_NAME } from "#client/features/character/lib/character-names.ts";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const TITLE = '.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title';
const TRAIL = ".shell-topbar-trail";
const PHONE_WIDTHS = [320, 360, 390, 430] as const;

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

for (const width of PHONE_WIDTHS) {
  test(`at ${String(width)} the Characters topbar prints its whole name and keeps New in the trail`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    const title = page.locator(TITLE);
    await expect(title).toContainText(SECTION_LABELS.characters);
    // The name is the title's floor, so the row cuts the census before it cuts a letter of the name.
    const name = title.locator(".shell-topbar-title-name");
    await expect(name).toHaveText(SECTION_LABELS.characters);
    await expect.poll(() => name.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.locator(TRAIL).getByRole("button", { name: CHARACTER_NEW_NAME, exact: true })).toBeVisible();
  });
}
