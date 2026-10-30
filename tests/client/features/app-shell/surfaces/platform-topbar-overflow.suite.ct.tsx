// The shell's measured overflow rows on the production shell: an action that no longer fits its row moves into the "More" menu with
// the handler its inline control calls, comes back inline when the row widens, and focus on a control that leaves the row lands on
// the menu trigger. The topbar trail and each list band declare a menu form per action; each form opens the surface its inline
// control opens.

import { TRAIL_OVERFLOW_LABEL } from "@orb/client/components";
import { APPEARANCE_CHANNEL_ROWS } from "@orb/client/lib";
import { seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const FONT_SCALE_PROPERTY = APPEARANCE_CHANNEL_ROWS.find((row) => row.key === "fontScale")?.name ?? "";
const ENLARGED = 3;
const REPORT_BUG = "Report a bug";

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
  const inline = trail.getByRole("button", { name: REPORT_BUG });
  const trigger = trail.getByRole("button", { name: TRAIL_OVERFLOW_LABEL });

  // Room to spare: every action inline, the trigger reserved but not offered.
  await expect(inline).toBeVisible();
  await expect(trigger).toBeHidden();

  // Focus on the action that is about to leave the row moves to the trigger instead of dropping to the page.
  await inline.focus();
  await setScale(page, ENLARGED);
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(inline).toBeHidden();

  // The menu carries the same handler: the entry opens the surface the inline control would have.
  await trigger.click();
  await page.getByRole("menuitem", { name: REPORT_BUG, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "What happened?", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

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
    await trail.getByRole("button", { name: TRAIL_OVERFLOW_LABEL }).click();
    await page.getByRole("menuitem", { name: form.label }).click();
    await expect(page.getByRole(form.surface.role, { name: form.surface.name, exact: true })).toBeVisible();
  });
}

const LIST_BAND_ACTION = '.shell-panel[data-panel-side="list"] [data-slot="list-pane-action"]';
const OVERFLOW_TRIGGER = '[data-slot="overflow-actions-trigger"]';

const SCALES = [3, 4, 5, 6, 7] as const;

/** Enlarge the text one step at a time, from `from`, until the band's trigger shows: how much text a band takes before it
 *  overflows depends on the engine's layout width, so the case does not guess it. */
async function enlargeUntilVisible(page: Page, trigger: Locator, from: number): Promise<void> {
  const ladder = SCALES.filter((scale) => scale >= from);
  let step = 0;
  await expect
    .poll(async () => {
      await setScale(page, ladder[Math.min(step, ladder.length - 1)] ?? from);
      step += 1;
      return trigger.isVisible();
    })
    .toBe(true);
}

// A band overflows where the list pane is the whole screen, so its width is the viewport's and text growth narrows it
// against fixed pixels. (On a desktop the pane's width scales with the text, and the band keeps its room.) The Characters
// band carries no action on a phone: its doors ride the topbar trail, covered above.
test.describe("a list band on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const band of [
    { section: "chats", label: SECTION_LABELS.chats, entry: "New chat", from: 3 },
    // Import is the first action, so the case enlarges past the step where New alone has moved.
    { section: "presets", label: SECTION_LABELS.presets, entry: "Import a preset", from: 5 },
    { section: "databank", label: "Databank", entry: "Add a document", from: 3 },
  ] as const) {
    test(`the ${band.section} band moves its actions into its menu as it narrows, and the entry opens the same surface`, async ({ mount, page }) => {
      await seedShellState(page, { activeSection: band.section });
      await mount<typeof AppShellStory>(STORY, {});
      const action = page.locator(LIST_BAND_ACTION);
      await expect(action).toBeVisible();
      const trigger = action.locator(OVERFLOW_TRIGGER);
      await expect(trigger).toBeHidden();
      await enlargeUntilVisible(page, trigger, band.from);
      await trigger.click();
      await page.getByRole("menuitem", { name: band.entry, exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });
  }
});
