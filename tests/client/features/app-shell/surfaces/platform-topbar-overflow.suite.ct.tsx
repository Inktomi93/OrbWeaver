// The shell's measured overflow rows on the production shell: an action that no longer fits its row moves into the "More" menu with
// the handler its inline control calls, comes back inline when the row widens, and focus on a control that leaves the row lands on
// the menu trigger. The topbar trail and each list band declare a menu form per action; each form opens the surface its inline
// control opens.

import { TRAIL_OVERFLOW_LABEL } from "@orb/client/lib";
import { enlargeUntilVisible, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { DATABANK_ADD_DOCUMENT_TITLE, DATABANK_MAINTENANCE_NAME } from "#client/features/databank/lib/databank-names.ts";
import { NEW_PRESET_NAME, PRESET_IMPORT_TITLE } from "#client/features/preset/lib/preset-names.ts";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const FONT_SCALE_PROPERTY = channelName("fontScale");
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
  await setRootFontScale(page, FONT_SCALE_PROPERTY, ENLARGED);
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(inline).toBeHidden();

  // The menu carries the same handler: the entry opens the surface the inline control would have.
  await trigger.click();
  await page.getByRole("menuitem", { name: REPORT_BUG, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "What happened?", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await setRootFontScale(page, FONT_SCALE_PROPERTY, null);
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
    await setRootFontScale(page, FONT_SCALE_PROPERTY, ENLARGED);
    await trail.getByRole("button", { name: TRAIL_OVERFLOW_LABEL }).click();
    await page.getByRole("menuitem", { name: form.label }).click();
    await expect(page.getByRole(form.surface.role, { name: form.surface.name, exact: true })).toBeVisible();
  });
}

const LIST_BAND_ACTION = '.shell-panel[data-panel-side="list"] [data-slot="list-pane-action"]';
const OVERFLOW_TRIGGER = '[data-slot="overflow-actions-trigger"]';
// The band's shown actions: each is a cell of the action row, and a folded cell is marked out of the row.
const SHOWN_CONTROLS = `${LIST_BAND_ACTION} > :not([data-overflowed]) :is(button, a)`;

const SCALES = [3, 4, 5, 6, 7] as const;

// A band overflows where the list pane is the whole screen, so its width is the viewport's and text growth narrows it
// against fixed pixels. (On a desktop the pane's width scales with the text, and the band keeps its room.) The band folds
// its secondary actions into its menu and keeps its primary inline, as an icon once its word does not fit. The Characters
// band carries no action on a phone: its doors ride the topbar trail, covered above.
test.describe("a list band on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const band of [
    { section: "chats", primary: "New chat", secondary: "Import a chat transcript", surface: "Import chats", from: 3 },
    // Import is the first action, so the case enlarges past the step where New alone has moved.
    { section: "presets", primary: NEW_PRESET_NAME, secondary: PRESET_IMPORT_TITLE, surface: PRESET_IMPORT_TITLE, from: 5 },
  ] as const) {
    test(`the ${band.section} band moves its secondary action into its menu as it narrows, keeps its primary inline, and the entry opens the same surface`, async ({
      mount,
      page,
    }) => {
      await seedShellState(page, { activeSection: band.section });
      await mount<typeof AppShellStory>(STORY, {});
      const action = page.locator(LIST_BAND_ACTION);
      await expect(action).toBeVisible();
      const trigger = action.locator(OVERFLOW_TRIGGER);
      await expect(trigger).toBeHidden();
      await enlargeUntilVisible(
        page,
        trigger,
        FONT_SCALE_PROPERTY,
        SCALES.filter((scale) => scale >= band.from),
      );
      // The primary is the one control the row still shows besides the trigger.
      await expect(page.locator(SHOWN_CONTROLS)).toHaveCount(1);
      await expect(page.locator(SHOWN_CONTROLS)).toHaveAccessibleName(new RegExp(`^(?:New|${band.primary})$`, "u"));
      await trigger.click();
      await expect(page.getByRole("menuitem", { name: band.primary, exact: true })).toHaveCount(0);
      await page.getByRole("menuitem", { name: band.secondary, exact: true }).click();
      await expect(page.getByRole("dialog", { name: band.surface, exact: true })).toBeVisible();
    });
  }

  // Databank's secondary action is its maintenance menu: folded, it is a submenu whose sweeps open the same confirm the inline menu's do.
  test("the databank band moves its maintenance menu into its own menu as it narrows, keeps Add a document inline, and each sweep opens its confirm", async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "databank" });
    await mount<typeof AppShellStory>(STORY, {});
    const action = page.locator(LIST_BAND_ACTION);
    await expect(action).toBeVisible();
    const trigger = action.locator(OVERFLOW_TRIGGER);
    await expect(trigger).toBeHidden();
    await enlargeUntilVisible(page, trigger, FONT_SCALE_PROPERTY, SCALES);
    await expect(page.locator(SHOWN_CONTROLS)).toHaveCount(1);
    await expect(page.locator(SHOWN_CONTROLS)).toHaveAccessibleName(DATABANK_ADD_DOCUMENT_TITLE);
    for (const sweep of ["Rebuild all documents", "Re-read all documents"]) {
      await trigger.click();
      await expect(page.getByRole("menuitem", { name: DATABANK_ADD_DOCUMENT_TITLE, exact: true })).toHaveCount(0);
      await page.getByRole("menuitem", { name: DATABANK_MAINTENANCE_NAME, exact: true }).click();
      await page.getByRole("menuitem", { name: sweep, exact: true }).click();
      await expect(page.getByRole("alertdialog", { name: `${sweep}?`, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    }
  });
});
