// In Looks, a theme deleted from its card's menu by keyboard hands focus to the card beside it once the card has left the grid, and
// "Edit in builder" by keyboard lands focus inside the builder that replaces the grid: the card and its confirm (or the menu) are gone by
// then, so without a hand-off focus falls to the page body. Back out of the builder returns focus to the control that opened it, for the
// same reason: the Back button unmounts with the builder. The section is the production Looks body over a corpus root, the themes are
// made through the production create verb, and the real server's own `themesChanged` event is what removes the deleted card.
// @subject packages/client/src/features/config/components/appearance-looks-section.tsx
import { ROW_DELETE_NAME } from "@orb/client/lib";
import { createThemeInputSchema } from "@orb/contracts/theme";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import {
  CONFIG_BACK_TO_LOOKS_NAME,
  CONFIG_EDIT_IN_BUILDER_NAME,
  CONFIG_THEME_GROUP_NAME,
  newThemeName,
} from "#client/features/config/lib/config-control-names.ts";
import { themeActionsName } from "#client/features/config/lib/theme-row-names.ts";
import { forwardUserEvent } from "../../../components/_forward-user-event.ts";
import type { LooksBusStory } from "./_looks-import-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_looks-import-stories/LooksBusStory";
const PROCEDURES = ["settings.getUserSettings", "settings.listThemes", "settings.removeTheme"] as const;
const OWN_THEMES = ["Dusk one", "Dusk two", "Dusk three"] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

async function mountLooks(
  page: Page,
  root: Root,
  cleanup: AsyncDisposableStack,
): Promise<{ readonly grid: Locator; readonly names: readonly string[]; readonly current: string }> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of OWN_THEMES) {
    await caller.settings.createTheme(createThemeInputSchema.parse({ name, override: {} }));
  }
  const themes = await caller.settings.listThemes();
  const names = themes.map((theme) => theme.name);
  // With no theme selected the server's default theme is the current one, and the builder door is named for it.
  const current = themes.find((theme) => theme.isDefault)?.name;
  if (current === undefined) {
    throw new Error("The corpus has no default theme");
  }
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, PROCEDURES),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await forwardUserEvent(page, root, "themesChanged", cleanup);
  return { grid: page.getByRole("radiogroup", { name: CONFIG_THEME_GROUP_NAME, exact: true }), names, current };
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

/** Deletes a theme through its card's menu and the confirm, with the keyboard alone. */
async function deleteByKeyboard(page: Page, theme: string): Promise<void> {
  await pressMenuItem(page, theme, ROW_DELETE_NAME);
  const confirm = page.getByRole("alertdialog").getByRole("button", { name: ROW_DELETE_NAME, exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

test("deleting a theme by keyboard moves focus to the next theme card once the card has left the grid", async ({ page, mount }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { grid } = await mountLooks(page, root, cleanup);
  await mount<typeof LooksBusStory>(STORY, {});
  await expect(grid.getByRole("radio", { name: OWN_THEMES[1] })).toBeVisible();

  await deleteByKeyboard(page, OWN_THEMES[1]);

  await expect(grid.getByRole("radio", { name: OWN_THEMES[1] })).toHaveCount(0);
  await expect(grid.getByRole("radio", { name: OWN_THEMES[2] })).toBeFocused();
});

test("deleting the last theme by keyboard moves focus to the card before it once the card has left the grid", async ({ page, mount }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { grid, names } = await mountLooks(page, root, cleanup);
  await mount<typeof LooksBusStory>(STORY, {});
  await expect(grid.getByRole("radio", { name: OWN_THEMES[2] })).toBeVisible();
  const before = names.at(-2);
  if (before === undefined) {
    throw new Error("The corpus lists fewer than two themes");
  }
  expect(names.at(-1)).toBe(OWN_THEMES[2]);

  await deleteByKeyboard(page, OWN_THEMES[2]);

  await expect(grid.getByRole("radio", { name: OWN_THEMES[2] })).toHaveCount(0);
  await expect(grid.getByRole("radio", { name: before })).toBeFocused();
});

test("Edit in builder by keyboard lands focus on the builder's first control", async ({ page, mount }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { grid } = await mountLooks(page, root, cleanup);
  await mount<typeof LooksBusStory>(STORY, {});
  await expect(grid.getByRole("radio", { name: OWN_THEMES[0] })).toBeVisible();

  await pressMenuItem(page, OWN_THEMES[0], CONFIG_EDIT_IN_BUILDER_NAME);

  await expect(grid).toHaveCount(0);
  await expect(page.getByRole("button", { name: CONFIG_BACK_TO_LOOKS_NAME, exact: true })).toBeFocused();
});

test("Back from Edit in builder returns focus to the theme card it was opened from", async ({ page, mount }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { grid } = await mountLooks(page, root, cleanup);
  await mount<typeof LooksBusStory>(STORY, {});
  await expect(grid.getByRole("radio", { name: OWN_THEMES[1] })).toBeVisible();
  await pressMenuItem(page, OWN_THEMES[1], CONFIG_EDIT_IN_BUILDER_NAME);
  const back = page.getByRole("button", { name: CONFIG_BACK_TO_LOOKS_NAME, exact: true });
  await expect(back).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(grid.getByRole("radio", { name: OWN_THEMES[1] })).toBeFocused();
});

test("Back from the new-theme builder returns focus to the button that opened it", async ({ page, mount }) => {
  await using root = await createCorpusHarness();
  await using cleanup = new AsyncDisposableStack();
  const { grid, current } = await mountLooks(page, root, cleanup);
  await mount<typeof LooksBusStory>(STORY, {});
  await expect(grid.getByRole("radio", { name: OWN_THEMES[0] })).toBeVisible();
  const door = page.getByRole("button", { name: newThemeName(current), exact: true });
  await door.focus();
  await page.keyboard.press("Enter");
  const back = page.getByRole("button", { name: CONFIG_BACK_TO_LOOKS_NAME, exact: true });
  await expect(back).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(door).toBeFocused();
});
