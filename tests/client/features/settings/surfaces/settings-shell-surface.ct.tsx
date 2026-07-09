// CT: the settings full-bleed shell (ux-flow-revamp J11). Drives the PRODUCTION path — the category nav
// (USER/APP groups), the default Appearance pane resolving over `settings.getUserSettings` (routeTrpc),
// switching to a placeholder category showing ITS distinct copy (not a generic sparkle), and the
// settings-search filtering the nav.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SettingsShellStory } from "../_ct-stories";

/** The getUserSettings read-model the Appearance pane suspends on — defaults are enough to render it. */
const USER_SETTINGS_VIEW = {
  userId: "user_ct_settings",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

test("renders the USER + APP group headings and the category rows", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await expect(component.getByText("User", { exact: true })).toBeVisible();
  await expect(component.getByText("App", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Appearance" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Connections" })).toBeVisible();
});

test("Appearance is the default pane (a real setting-row surface, not a placeholder)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  // The migrated #31 appearance surface renders its "Message style" section.
  await expect(component.getByText("Message style")).toBeVisible();
});

test("switching to an unbuilt category shows ITS distinct teaching copy", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("button", { name: "Connections" }).click();
  await expect(component.getByText("Provider credentials and model connections.")).toBeVisible();
});

test("the settings search filters the nav rows", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("textbox", { name: "Search settings" }).fill("person");
  await expect(component.getByRole("button", { name: "Personas" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Appearance" })).toHaveCount(0);
});

// The nav pins because each column OWNS its scroll axis: the Row is `align="stretch"`, so both columns
// FILL the row height and their own `overflow-y-auto` caps + scrolls them internally — the outer modal
// wrapper never scrolls (which is what swept the nav off-screen: side-eye round-3, nav-button top
// 262→-1516). The faithful, height-independent proof is that both columns are height-CAPPED to the row
// (fill it) rather than growing to content — under the old `align="start"` the shorter nav and the taller
// content pane had DIFFERENT heights (each content-sized) and neither capped.
test("both settings columns fill the row height (own their scroll axis; nav can't be swept)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await expect(component.getByRole("textbox", { name: "Search settings" })).toBeVisible();

  const heights = await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Search settings"]');
    const nav = input?.closest("[class*=overflow-y-auto]") ?? null;
    const row = nav?.parentElement ?? null;
    const content = row ? [...row.children].find((el) => !el.contains(input as Node)) : null;
    const isScroller = (el: Element | null): boolean =>
      el !== null && ["auto", "scroll"].includes(getComputedStyle(el).overflowY);
    return {
      row: row?.clientHeight ?? -1,
      nav: nav?.clientHeight ?? -2,
      content: content?.clientHeight ?? -3,
      // each column is its OWN independent scroll container (neither the shared outer wrapper)
      navScrolls: isScroller(nav),
      contentScrolls: isScroller(content ?? null),
    };
  });
  // Both columns are capped to the row (they FILL it) — equal, and equal to the row — not content-sized.
  expect(heights.navScrolls).toBe(true);
  expect(heights.contentScrolls).toBe(true);
  expect(Math.abs(heights.nav - heights.row)).toBeLessThan(2);
  expect(Math.abs(heights.content - heights.row)).toBeLessThan(2);
});
