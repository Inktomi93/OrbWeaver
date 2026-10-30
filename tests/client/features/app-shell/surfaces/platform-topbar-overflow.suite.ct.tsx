// The shell's measured overflow rows on the production shell: an action that no longer fits its row moves into the "More" menu with
// the handler its inline control calls, comes back inline when the row widens, and focus on a control that leaves the row lands on
// the menu trigger. The topbar trail and each list band declare a menu form per action; each form opens the surface its inline
// control opens.

import { OVERFLOW_TRIGGER_LABEL } from "@orb/client/components";
import { APPEARANCE_CHANNEL_ROWS } from "@orb/client/lib";
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
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

for (const form of [
  { label: "Notifications", surface: { role: "dialog", name: "Notifications" } },
  { label: "Report a bug", surface: { role: "textbox", name: "What happened?" } },
] as const) {
  test(`the trail's ${form.label} menu entry opens the surface its inline control opens`, async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    await mount<typeof AppShellStory>(STORY, {});
    const trail = page.locator(".shell-topbar-trail");
    await setScale(page, ENLARGED);
    await trail.getByRole("button", { name: OVERFLOW_TRIGGER_LABEL }).click();
    await page.getByRole("menuitem", { name: form.label }).click();
    await expect(page.getByRole(form.surface.role, { name: form.surface.name, exact: true })).toBeVisible();
  });
}

const LIST_BAND_ACTION = '.shell-panel[data-panel-side="list"] [data-slot="list-pane-action"]';

for (const band of [
  { section: "chats", label: SECTION_LABELS.chats, entry: "New chat", scale: ENLARGED },
  { section: "characters", label: SECTION_LABELS.characters, entry: "New character", scale: ENLARGED },
  { section: "presets", label: SECTION_LABELS.presets, entry: "Import a preset", scale: 5 },
  { section: "databank", label: "Databank", entry: "Add a document", scale: ENLARGED },
] as const) {
  test(`the ${band.section} list band moves its actions into its menu as it narrows, and the entry opens the same surface`, async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "home" });
    await mount<typeof AppShellStory>(STORY, {});
    await page.locator(".shell-rail").getByRole("button", { name: band.label, exact: true }).click();
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", band.section);
    const action = page.locator(LIST_BAND_ACTION);
    await expect(action).toBeVisible();
    await expect(action.getByRole("button", { name: OVERFLOW_TRIGGER_LABEL })).toBeHidden();
    await setScale(page, band.scale);
    const trigger = action.getByRole("button", { name: OVERFLOW_TRIGGER_LABEL });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await page.getByRole("menuitem", { name: band.entry, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
}
