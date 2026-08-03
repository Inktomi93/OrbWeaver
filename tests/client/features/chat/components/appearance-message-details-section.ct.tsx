// CT: the "Message details & actions" appearance SECTION (SET-SEAMS stage 1) — a chat-owned section of the
// decomposed appearance pane, and the one that ABSORBED the pane's old `message-actions` sub (same reader,
// so one owner). P1 (SET-SEAMS §9): the `appearance` section-patch carries EXACTLY the eight owned keys.
// The expected key set is re-spelled here on purpose.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { AppearanceMessageDetailsSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_message_details", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
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
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
}

function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "appearance" ? input.patch : undefined;
}

test("renders the detail chips AND the absorbed action cluster under one heading", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceMessageDetailsSectionStory />);
  await expect(page.getByRole("heading", { name: "Message details & actions" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show timestamps" })).toBeVisible();
  // The absorbed `message-actions` control lives here now — it did not get lost in the merge.
  await expect(page.getByRole("combobox", { name: "Action cluster" })).toContainText("Reveal on hover");
});

test("toggling a detail chip patches its key, key-minimally", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceMessageDetailsSectionStory />);
  await page.getByRole("switch", { name: "Show token count" }).click();

  await expect.poll(() => lastPatch(trpc)?.["showTokenCount"], { intervals: [20, 50, 100] }).toBe(true);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

test("the action cluster patches messageActions, key-minimally", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceMessageDetailsSectionStory />);
  await page.getByRole("combobox", { name: "Action cluster" }).click();
  await page.getByRole("option", { name: "Always visible" }).click();

  await expect.poll(() => lastPatch(trpc)?.["messageActions"], { intervals: [20, 50, 100] }).toBe("expanded");
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});
