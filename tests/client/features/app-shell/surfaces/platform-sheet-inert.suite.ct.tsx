// A full-screen sheet on a phone leaves the regions it covers inert: the tab bar and the roster behind the Context sheet take
// no focus, the sheet keeps it, and closing the sheet gives them back. Coarse pointer, portrait and landscape, on Chromium and the
// opt-in WebKit project.
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const CONTEXT_TOGGLE = /^(?:Show|Hide) details$/u;
const MAX_TAB_STOPS = 40;
const REGIMES = [
  { name: "portrait", viewport: { width: 390, height: 844 } },
  { name: "landscape", viewport: { width: 667, height: 375 } },
] as const;

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

for (const regime of REGIMES) {
  test.describe(`on a coarse phone in ${regime.name}`, () => {
    test.use({ viewport: regime.viewport, hasTouch: true, isMobile: true });

    test("the full-screen context sheet inerts the tab bar and the roster it covers, keeps focus in the sheet, and the close restores them", async ({
      mount,
      page,
    }) => {
      await seedShellState(page, { activeSection: "chats" });
      await mount<typeof AppShellStory>(STORY, {});
      const bar = page.getByRole("navigation", { name: "Primary", exact: true });
      const list = page.locator(LIST);
      const context = page.locator(CONTEXT);
      await expect(list).toHaveAttribute("data-panel-mode", "docked");
      await expect(bar).not.toHaveAttribute("inert", "");
      await page.getByRole("button", { name: CONTEXT_TOGGLE }).click();
      await expect(context).toHaveAttribute("data-panel-mode", "overlay");
      await expect(bar).toHaveAttribute("inert", "");
      await expect(list).toHaveAttribute("inert", "");
      // The positive control: the walk does reach the sheet, so the covered regions had every chance to take a stop.
      let reachedSheet = false;
      for (let step = 0; step < MAX_TAB_STOPS; step += 1) {
        await page.keyboard.press("Tab");
        expect(await bar.evaluate((nav) => nav.contains(document.activeElement))).toBe(false);
        expect(await list.evaluate((pane) => pane.contains(document.activeElement))).toBe(false);
        reachedSheet ||= await context.evaluate((element) => element.contains(document.activeElement));
      }
      expect(reachedSheet).toBe(true);
      await context.getByRole("button", { name: "Close Chats details", exact: true }).click();
      await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
      await expect(bar).not.toHaveAttribute("inert", "");
      await expect(list).not.toHaveAttribute("inert", "");
    });
  });
}
