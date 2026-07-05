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
