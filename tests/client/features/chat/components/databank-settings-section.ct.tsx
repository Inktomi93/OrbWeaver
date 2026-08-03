// CT: the Databank settings SECTION (Phase B ④ — databank-settings-section.tsx), a settings-section
// CONTRIBUTION into the chat-behavior pane. Drives the production autosave path: getUserSettings seeds the
// form (k/minScore/rerank/slotTokenBudget), each change debounces then fires
// updateUserSettingsSection("databank") with the section patch (retrieval leaf re-nested + the slot budget).
// Proves the previously-dormant databank retrieval knobs now have a real write path.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { DatabankSettingsSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = {
  userId: "user_ct_databank",
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

/** The most recent databank-section patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "databank" ? input.patch : undefined;
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
  await expect.poll(() => (lastPatch(trpc)?.["retrieval"] as Record<string, unknown> | undefined)?.["k"], { intervals: [20, 50, 100] }).toBe(6);
  expect((lastPatch(trpc)?.["retrieval"] as Record<string, unknown>)?.["minScore"]).toBe(0.25);
});

test("toggling rerank fires the databank patch with rerank=true", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<DatabankSettingsSectionStory />);
  await page.getByRole("switch", { name: "Rerank results" }).click();
  await expect.poll(() => (lastPatch(trpc)?.["retrieval"] as Record<string, unknown> | undefined)?.["rerank"], { intervals: [20, 50, 100] }).toBe(true);
});

test("stepping the token budget fires the databank patch with slotTokenBudget", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<DatabankSettingsSectionStory />);
  await page.getByRole("textbox", { name: "Databank token budget" }).focus();
  await page.getByRole("button", { name: "Increase" }).last().click();
  await expect.poll(() => lastPatch(trpc)?.["slotTokenBudget"], { intervals: [20, 50, 100] }).toBe(4097);
});
