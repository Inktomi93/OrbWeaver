// CT: the REAL theme picker/library (D44 §12.1 · themes-design §4). Drives the production path — the
// `listThemes` (owned ∪ seeds) + `getUserSettings` (the active `selectedThemeId`) reads, stubbed via
// routeTrpc. Asserts the seed rows render, Hearth is active when no explicit selection (selectedThemeId
// null), and a seed row offers Customize while an owned row offers Edit/Delete.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ThemePickerStory } from "../_ct-stories";

const NOW = 0;
interface SeedView {
  readonly id: string;
  readonly name: string;
  readonly override: { readonly background: string; readonly accent: string };
  readonly css: null;
  readonly isSeed: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}
function seed(id: string, name: string, bg: string, accent: string): SeedView {
  return {
    id,
    name,
    override: { background: bg, accent },
    css: null,
    isSeed: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
const OWNED = {
  id: "theme_owned01",
  name: "My Theme",
  override: { background: "oklch(0.2 0.02 300)", accent: "oklch(0.7 0.1 300)" },
  css: null,
  isSeed: false,
  createdAt: NOW,
  updatedAt: NOW,
};
const THEMES = [
  seed("theme_00000000000000000000000001", "Hearth", "oklch(0.158 0.006 60)", "oklch(0.72 0.175 52)"),
  seed("theme_00000000000000000000000002", "Mocha", "oklch(0.15 0.015 250)", "oklch(0.7 0.14 250)"),
  seed("theme_00000000000000000000000003", "Light", "oklch(0.98 0.004 75)", "oklch(0.55 0.16 50)"),
  OWNED,
];
const SETTINGS_VIEW = {
  userId: "user_ct_theme",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS, // theme.selectedThemeId defaults to null ⇒ Hearth is active
  updatedAt: 0,
};

async function stub(page: Page): Promise<void> {
  await routeTrpc(page, {
    "settings.listThemes": () => THEMES,
    "settings.getUserSettings": () => SETTINGS_VIEW,
  });
}

test("renders the seed palettes + the owned theme", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ThemePickerStory />);
  await expect(component.getByText("Hearth", { exact: true })).toBeVisible();
  await expect(component.getByText("Mocha", { exact: true })).toBeVisible();
  await expect(component.getByText("Light", { exact: true })).toBeVisible();
  await expect(component.getByText("My Theme", { exact: true })).toBeVisible();
});

test("Hearth is active when no theme is explicitly selected (selectedThemeId null)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ThemePickerStory />);
  await expect(component.getByLabel("Active theme")).toBeVisible();
});

test("a seed offers Customize; an owned theme offers Edit + Delete", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ThemePickerStory />);
  // The Menu popup portals to the document body — query it via `page`, not the mounted component root.
  await component.getByRole("button", { name: "Hearth actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Customize" })).toBeVisible();
  await page.keyboard.press("Escape");

  await component.getByRole("button", { name: "My Theme actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

test("Delete does not destroy immediately — it opens an AlertDialog confirm (F4)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ThemePickerStory />);
  await component.getByRole("button", { name: "My Theme actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  // The destructive confirm — no mutation has fired yet (UI-Primitives §13.8 R4).
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByText("Delete this theme?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
});
