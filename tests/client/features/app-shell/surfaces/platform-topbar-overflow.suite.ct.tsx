// The topbar trail's measured overflow row on the production shell: an action that no longer fits its row moves into the "More"
// menu with the handler its inline control calls, comes back inline when the row widens, and focus on a control that leaves the
// row lands on the menu trigger.

import { OVERFLOW_TRIGGER_LABEL } from "@orb/client/components";
import { APPEARANCE_CHANNEL_ROWS } from "@orb/client/lib";
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const FONT_SCALE_PROPERTY = APPEARANCE_CHANNEL_ROWS.find((row) => row.key === "fontScale")?.name ?? "";
const ENLARGED = 3;
const TOGGLE = /^(?:Show|Hide) details$/u;

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

test.use({ viewport: { width: 1440, height: 900 } });

async function setScale(page: Page, factor: number | null): Promise<void> {
  await page.evaluate(
    ([property, value]) => {
      if (value === null) {
        document.getElementById("overflow-scale")?.remove();
        return;
      }
      const style = document.getElementById("overflow-scale") ?? document.head.appendChild(document.createElement("style"));
      style.id = "overflow-scale";
      style.textContent = `:root { ${property}: ${value} !important; }`;
    },
    [FONT_SCALE_PROPERTY, factor === null ? null : String(factor)] as const,
  );
}

test("an action leaves the topbar row for the menu as it narrows and returns as it widens, keeping its handler and its focus on the trigger", async ({
  mount,
  page,
}) => {
  await seedShellState(page, { activeSection: "chats" });
  await mount<typeof AppShellStory>(STORY, {});
  const trail = page.locator(".shell-topbar-trail");
  const inline = trail.getByRole("button", { name: TOGGLE });
  const trigger = trail.getByRole("button", { name: OVERFLOW_TRIGGER_LABEL });
  const context = page.locator(CONTEXT);

  // Room to spare: every action inline, the trigger reserved but not offered.
  await expect(inline).toBeVisible();
  await expect(trigger).toBeHidden();
  await expect(context).toHaveAttribute("data-panel-mode", "collapsed");

  // Focus on the action that is about to leave the row moves to the trigger instead of dropping to the page.
  await inline.focus();
  await setScale(page, ENLARGED);
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(inline).toBeHidden();

  // The menu carries the same handler: Show details opens the pane the inline control would have.
  await trigger.click();
  await page.getByRole("menuitem", { name: "Show details", exact: true }).click();
  await expect(context).not.toHaveAttribute("data-panel-mode", "collapsed");

  await setScale(page, null);
  await expect(inline).toBeVisible();
  await expect(trigger).toBeHidden();
});
