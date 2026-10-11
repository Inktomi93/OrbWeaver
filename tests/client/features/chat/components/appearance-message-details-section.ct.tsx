// CT: the "Message details & actions" appearance SECTION (SET-SEAMS stage 1) — a chat-owned section of the
// decomposed appearance pane, and the one that ABSORBED the pane's old `message-actions` sub (same reader,
// so one owner). P1 (SET-SEAMS §9): the `appearance` section-patch carries EXACTLY the eight owned keys.
// The expected key set is re-spelled here on purpose.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { lastSettingsPatch, UPDATE_USER_SETTINGS_SECTION } from "../../../../support/node/last-settings-patch.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AppearanceMessageDetailsSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_message_details", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, configUnreadable: null, updatedAt: 0 };
const OWNED_KEYS = [
  "messageActions",
  "showGenerationCost",
  "showGenerationTimer",
  "showLLMReasoningIcon",
  "showMessageId",
  "showModelIcon",
  "showTimestamps",
  "showTokenCount",
];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_USER_SETTINGS_SECTION]: () => SETTINGS_VIEW });
}

test("renders the detail chips AND the absorbed action cluster under one heading", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageDetailsSectionStory />);
  await expect(page.getByRole("heading", { name: "Message details & actions" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show timestamps" })).toBeVisible();
  // The absorbed `message-actions` control lives here now — it did not get lost in the merge.
  await expect(page.getByRole("combobox", { name: "Action cluster" })).toContainText("Reveal on hover");
});

test("Show model says what the credit names: the model, its provider and the connection", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageDetailsSectionStory />);
  await expect(page.getByRole("switch", { name: "Show model" })).toHaveAccessibleDescription(/the model, provider and connection that generated each reply/u);
});

test("toggling a detail chip patches its key, key-minimally", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceMessageDetailsSectionStory />);
  await page.getByRole("switch", { name: "Show token count" }).click();

  await expect.poll(() => lastSettingsPatch(trpc, "appearance")?.["showTokenCount"], { intervals: [20, 50, 100] }).toBe(true);
  expect(Object.keys(lastSettingsPatch(trpc, "appearance") ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

test("the action cluster patches messageActions, key-minimally", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceMessageDetailsSectionStory />);
  await page.getByRole("combobox", { name: "Action cluster" }).click();
  await page.getByRole("option", { name: "Always visible" }).click();

  await expect.poll(() => lastSettingsPatch(trpc, "appearance")?.["messageActions"], { intervals: [20, 50, 100] }).toBe("expanded");
  expect(Object.keys(lastSettingsPatch(trpc, "appearance") ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});
