// In a short landscape viewport the rail's section scroller ends above the foot that holds the persona avatar, so a press
// on the visible centre of any section button reaches that button.
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

for (const section of ["characters", "databank"] as const) {
  test(`with ${section} open, every visible section button is what a press on its centre reaches`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    await seedShellState(page, { activeSection: section });
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
    await mount<typeof AppShellStory>(STORY);
    const scroller = page.locator(".shell-rail-sections");
    await expect(scroller.getByRole("button", { name: SECTION_LABELS[section], exact: true })).toBeVisible();
    const misses = await scroller.evaluate((node) => {
      const room = node.getBoundingClientRect();
      return [...node.querySelectorAll("button")].flatMap((button) => {
        const box = button.getBoundingClientRect();
        const top = Math.max(box.top, room.top);
        const bottom = Math.min(box.bottom, room.bottom);
        if (bottom <= top) {
          return [];
        }
        const reached = document.elementFromPoint(box.x + box.width / 2, (top + bottom) / 2)?.closest("button");
        return reached === button ? [] : [button.getAttribute("aria-label")];
      });
    });
    expect(misses).toEqual([]);
    // The foot really holds the avatar, so the sweep above is not vacuous.
    await expect(page.locator(".shell-rail-actions").getByRole("button", { name: /^Playing as /u })).toBeVisible();
  });
}
