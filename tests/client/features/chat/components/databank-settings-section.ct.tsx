// CT: the Databank settings SECTION (Phase B ④ — databank-settings-section.tsx), a settings-section
// CONTRIBUTION into the chat-behavior pane. Drives the production autosave path: getUserSettings seeds the
// form (k/minScore/rerank/slotTokenBudget), each change debounces then fires
// updateUserSettingsSection("databank") with the section patch (retrieval leaf re-nested + the slot budget).
// Proves the previously-dormant databank retrieval knobs now have a real write path.

// @orb-waive-file no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { lastSettingsPatch, UPDATE_USER_SETTINGS_SECTION } from "@orb/testkit/node/last-settings-patch.ts";
import type { TrpcRecorder } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { DatabankSettingsSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = {
  userId: "user_ct_databank",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  configUnreadable: null,
  updatedAt: 0,
};

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_USER_SETTINGS_SECTION]: () => SETTINGS_VIEW,
  });
}

test("mounts with the persisted databank defaults (k 5, minScore 0.25, rerank off, budget 4096)", async ({ mount, page }) => {
  await stub(page);
  await mount(<DatabankSettingsSectionStory />);
  await expect(page.getByRole("textbox", { name: "Documents retrieved" })).toHaveValue("5");
  await expect(page.getByRole("textbox", { name: "Match threshold" })).toHaveValue("0.25");
  await expect(page.getByRole("switch", { name: "Rerank results" })).not.toBeChecked();
  // The NumberField groups thousands for display; the wire value stays the raw number.
  await expect(page.getByRole("textbox", { name: "Databank token budget" })).toHaveValue("4,096");
});

test("stepping k fires updateUserSettingsSection('databank') with the re-nested retrieval leaf", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<DatabankSettingsSectionStory />);
  await page.getByRole("textbox", { name: "Documents retrieved" }).focus();
  await page.getByRole("button", { name: "Increase" }).first().click();
  await expect(page.getByRole("textbox", { name: "Documents retrieved" })).toHaveValue("6");
  // The autosave form submits the whole section — the retrieval leaf carries k (moved) + minScore/rerank.
  // @orb-waive no-test-fabrication(Record<string, unknown> | undefined): baselined when the gate widened to value casts; burn-down item 906.
  await expect
    .poll(() => (lastSettingsPatch(trpc, "databank")?.["retrieval"] as Record<string, unknown> | undefined)?.["k"], { intervals: [20, 50, 100] })
    .toBe(6);
  expect((lastSettingsPatch(trpc, "databank")?.["retrieval"] as Record<string, unknown>)?.["minScore"]).toBe(0.25);
});

test("toggling rerank fires the databank patch with rerank=true", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<DatabankSettingsSectionStory />);
  await page.getByRole("switch", { name: "Rerank results" }).click();
  // @orb-waive no-test-fabrication(Record<string, unknown> | undefined): baselined when the gate widened to value casts; burn-down item 906.
  await expect
    .poll(() => (lastSettingsPatch(trpc, "databank")?.["retrieval"] as Record<string, unknown> | undefined)?.["rerank"], { intervals: [20, 50, 100] })
    .toBe(true);
});

test("stepping the token budget fires the databank patch with slotTokenBudget", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<DatabankSettingsSectionStory />);
  await page.getByRole("textbox", { name: "Databank token budget" }).focus();
  await page.getByRole("button", { name: "Increase" }).last().click();
  await expect.poll(() => lastSettingsPatch(trpc, "databank")?.["slotTokenBudget"], { intervals: [20, 50, 100] }).toBe(4097);
});
