// CT: the World-info settings SECTION (Phase B ② — world-info-settings-section.tsx), a settings-section
// CONTRIBUTION into the chat-behavior pane. Drives the production autosave path: getUserSettings seeds the
// form (scanDepth/tokenBudget), each field change debounces then fires updateUserSettingsSection("worldInfo")
// with the full worldInfo-section patch. Proves the previously-UI-less knobs now have a real write path.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { WorldInfoSettingsSectionStory } from "../_ct-stories";

const SETTINGS_VIEW = {
  userId: "user_ct_world_info",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

const UPDATE_PROC = "settings.updateUserSettingsSection";

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => ({}),
  });
}

/** The most recent worldInfo-section patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "worldInfo" ? input.patch : undefined;
}

test("mounts with the persisted defaults rendered (scanDepth 6, tokenBudget 1024)", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorldInfoSettingsSectionStory />);
  await expect(page.getByRole("textbox", { name: "Scan depth" })).toHaveValue("6");
  // The NumberField groups thousands for display; the wire value stays the raw number (asserted below).
  await expect(page.getByRole("textbox", { name: "Token budget" })).toHaveValue("1,024");
});

test("stepping scan depth fires updateUserSettingsSection('worldInfo') with the full section (scanDepth moved, tokenBudget carried)", async ({
  mount,
  page,
}) => {
  const trpc = await stub(page);
  await mount(<WorldInfoSettingsSectionStory />);
  await page.getByRole("textbox", { name: "Scan depth" }).focus();
  await page.getByRole("button", { name: "Increase" }).first().click();
  await expect(page.getByRole("textbox", { name: "Scan depth" })).toHaveValue("7");
  // The autosave form submits the whole section — the moved field AND the untouched one, field-for-field.
  await expect.poll(() => lastPatch(trpc)?.["scanDepth"], { intervals: [20, 50, 100] }).toBe(7);
  expect(lastPatch(trpc)?.["tokenBudget"]).toBe(1024);
});

test("stepping token budget fires the worldInfo patch with the new tokenBudget", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<WorldInfoSettingsSectionStory />);
  await page.getByRole("textbox", { name: "Token budget" }).focus();
  await page.getByRole("button", { name: "Increase" }).nth(1).click();
  await expect.poll(() => lastPatch(trpc)?.["tokenBudget"], { intervals: [20, 50, 100] }).toBe(1025);
});
