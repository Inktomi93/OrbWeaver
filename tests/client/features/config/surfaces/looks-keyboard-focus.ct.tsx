// In Looks, a theme deleted from its card's menu by keyboard hands focus to the card beside it, and "Edit in builder" by keyboard
// lands focus inside the builder that replaces the grid: the card and its confirm (or the menu) are gone by then, so without a
// hand-off focus falls to the page body. The section is the production Looks body over a corpus root; the themes are made through
// the production create verb.
// @subject packages/client/src/features/config/components/appearance-looks-section.tsx
import { createThemeInputSchema } from "@orb/contracts/theme";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CONFIG_BACK_TO_LOOKS_NAME, CONFIG_EDIT_IN_BUILDER_NAME } from "#client/features/config/lib/config-control-names.ts";
import { themeActionsName } from "#client/features/config/lib/theme-row-names.ts";
import type { LooksImportStory } from "./_looks-import-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_looks-import-stories/LooksImportStory";
const PROCEDURES = ["settings.getUserSettings", "settings.listThemes", "settings.removeTheme"] as const;
const OWN_THEMES = ["Dusk one", "Dusk two", "Dusk three"] as const;
const DELETE_NAME = "Delete";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

async function mountLooks(page: Page, root: Root): Promise<{ readonly grid: Locator; readonly rpc: TrpcRecorder; readonly names: readonly string[] }> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of OWN_THEMES) {
    await caller.settings.createTheme(createThemeInputSchema.parse({ name, override: {} }));
  }
  const names = (await caller.settings.listThemes()).map((theme) => theme.name);
  const rpc = await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  return { grid: page.getByRole("radiogroup", { name: "Theme", exact: true }), rpc, names };
}

/** Opens a theme card's menu with the keyboard and presses one of its items. */
async function pressMenuItem(page: Page, theme: string, item: string): Promise<void> {
  const trigger = page.getByRole("button", { name: themeActionsName(theme), exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const entry = page.getByRole("menuitem", { name: item, exact: true });
  await entry.focus();
  await page.keyboard.press("Enter");
}

test("deleting a theme by keyboard moves focus to the next theme card", async ({ page, mount }) => {
  await using root = await createCorpusHarness();
  const { grid, rpc } = await mountLooks(page, root);
  await mount<typeof LooksImportStory>(STORY, {});
  await expect(grid.getByRole("radio", { name: OWN_THEMES[1] })).toBeVisible();

  await pressMenuItem(page, OWN_THEMES[1], DELETE_NAME);
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: DELETE_NAME, exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");

  // The server's bus is what removes the card from the grid, and this mount has no socket: the hand-off at the confirm's close is what is under test.
  await expect.poll(() => rpc.count("settings.removeTheme")).toBe(1);
  await expect(grid.getByRole("radio", { name: OWN_THEMES[2] })).toBeFocused();
});

test("deleting the last theme by keyboard moves focus to the card before it", async ({ page, mount }) => {
  await using root = await createCorpusHarness();
  const { grid, rpc, names } = await mountLooks(page, root);
  await mount<typeof LooksImportStory>(STORY, {});
  await expect(grid.getByRole("radio", { name: OWN_THEMES[2] })).toBeVisible();
  const before = names.at(-2);
  expect(names.at(-1)).toBe(OWN_THEMES[2]);

  await pressMenuItem(page, OWN_THEMES[2], DELETE_NAME);
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: DELETE_NAME, exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");

  await expect.poll(() => rpc.count("settings.removeTheme")).toBe(1);
  await expect(grid.getByRole("radio", { name: before ?? "" })).toBeFocused();
});

test("Edit in builder by keyboard lands focus on the builder's first control", async ({ page, mount }) => {
  await using root = await createCorpusHarness();
  const { grid } = await mountLooks(page, root);
  await mount<typeof LooksImportStory>(STORY, {});
  await expect(grid.getByRole("radio", { name: OWN_THEMES[0] })).toBeVisible();

  await pressMenuItem(page, OWN_THEMES[0], CONFIG_EDIT_IN_BUILDER_NAME);

  await expect(grid).toHaveCount(0);
  await expect(page.getByRole("button", { name: CONFIG_BACK_TO_LOOKS_NAME, exact: true })).toBeFocused();
});
