// CT: the save-status seam's REPORT half (SET-SEAMS §3 — `useReportSaveStatus` + the hosting context).
// Driven through the PRODUCTION composition (the real settings shell hosting the real contributed
// sections), because the seam's whole claim is about what a HOST sees:
//   HOSTED   — the shell renders ONE aggregate footer and the reporting sections stay quiet.
//   DEGRADED — a section mounted with NO host renders its own inline status in every state (the pre-seam
//              behavior, so a not-yet-migrated pane or a standalone story is unchanged).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/ct/route-trpc";
import { SettingsShellStory } from "../features/settings/_ct-stories";
import { WorldInfoSettingsSectionStory } from "../features/world-info/_ct-stories";

const SETTINGS_VIEW = {
  userId: "user_ct_save_seam",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};
const UPDATE_PROC = "settings.updateUserSettingsSection";

test("HOSTED: reporting sections stay quiet and the host shows ONE aggregate", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
  await mount(<SettingsShellStory />);
  await page.getByRole("button", { name: "Chat behavior" }).click();
  await page.getByRole("heading", { name: "World info" }).waitFor();

  const footer = page.locator('[data-slot="settings-save-footer"]');
  await expect(footer).toHaveCount(1);
  await expect(footer).toContainText("Saved");
  // The reporting sections render NO status of their own while hosted (N stacked footers is the smear the
  // seam exists to kill). The pane's own welded `chat` form is not a contributed section — stage 2 folds it in.
  await expect(page.locator('#settings-anchor-chat-behavior-world-info [data-slot="autosave-status"]')).toHaveCount(0);
  await expect(page.locator('#settings-anchor-chat-behavior-databank [data-slot="autosave-status"]')).toHaveCount(0);
});

test("DEGRADED: with no host above it, a section renders its own inline status", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
  await mount(<WorldInfoSettingsSectionStory />);

  await expect(page.locator('[data-slot="settings-save-footer"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="autosave-status"]')).toContainText("Saved");
});
