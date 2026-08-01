// CT: the "Chat & message handling" SECTION (SET-SEAMS stage 2) — one of the two chat-owned sections the
// decomposed chat-behavior pane is built from. Drives the production autosave path: `getUserSettings` seeds
// the projected form, each control change debounces then fires `updateUserSettingsSection("chat")`.
//
// P1 — PATCH MINIMALITY (SET-SEAMS §9): the wire payload carries EXACTLY this section's six owned keys, and
// never the sibling Streaming section's. The expected key set is re-spelled here on purpose — importing the
// section's own `OWNS` tuple would make the test agree with the code by construction and prove nothing.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatMessageHandlingSectionStory } from "../_ct-stories";

const SETTINGS_VIEW = { userId: "user_ct_message_handling", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["autoContinue", "autoSwipe", "continueOnSend", "customStoppingStrings", "enterSends", "generateOnEmptySend"];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
}

/** The most recent `chat` section-patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "chat" ? input.patch : undefined;
}

test("mounts with the persisted defaults rendered (Enter-to-send on)", async ({ mount, page }) => {
  await stub(page);
  await mount(<ChatMessageHandlingSectionStory />);
  await expect(page.getByRole("heading", { name: "Chat & message handling" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Enter to send" })).toBeChecked();
});

test("toggling Enter-to-send patches the chat section with ONLY this section's six keys", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatMessageHandlingSectionStory />);
  await page.getByRole("switch", { name: "Enter to send" }).click();

  await expect.poll(() => lastPatch(trpc)?.["enterSends"], { intervals: [20, 50, 100] }).toBe(false);
  // P1: the Streaming section's keys never ride along — a full-blob patch here would carry this section's
  // STALE copy of them and silently revert whatever Streaming just saved (the lost update §2.1 describes).
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
  expect("smoothStream" in (lastPatch(trpc) ?? {})).toBe(false);
});

test("Send-continues-the-reply patches continueOnSend, still key-minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatMessageHandlingSectionStory />);
  await page.getByRole("switch", { name: "Send continues the reply" }).click();

  await expect.poll(() => lastPatch(trpc)?.["continueOnSend"], { intervals: [20, 50, 100] }).toBe(false);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

test("Empty-Enter-generates patches generateOnEmptySend (W-E)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatMessageHandlingSectionStory />);
  await page.getByRole("switch", { name: "Empty Enter generates a reply" }).click();
  await expect.poll(() => lastPatch(trpc)?.["generateOnEmptySend"], { intervals: [20, 50, 100] }).toBe(false);
});

test("custom stopping strings: newline text projects back to a string[] patch", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatMessageHandlingSectionStory />);
  await page.getByRole("textbox", { name: "Custom stopping strings" }).fill("###\nEND");
  await expect.poll(() => lastPatch(trpc)?.["customStoppingStrings"], { intervals: [20, 50, 100] }).toEqual(["###", "END"]);
});

test("auto-swipe detail fields are gated behind the auto-swipe toggle, and the patch keeps the nest minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatMessageHandlingSectionStory />);
  // Hidden by default (auto-swipe off).
  await expect(page.getByRole("textbox", { name: "Blacklisted phrases" })).toHaveCount(0);
  await page.getByRole("switch", { name: "Auto-swipe short replies" }).click();
  await expect(page.getByRole("textbox", { name: "Blacklisted phrases" })).toBeVisible();

  await expect.poll(() => (lastPatch(trpc)?.["autoSwipe"] as { enabled?: boolean } | undefined)?.enabled, { intervals: [20, 50, 100] }).toBe(true);
  // `autoSwipe` is claimed at the TOP-level key; its editor-less `maxRetries` leaf is omitted so the
  // server's deepMergePlain preserves the stored value (SET-SEAMS §2.3).
  expect(Object.keys((lastPatch(trpc)?.["autoSwipe"] as Record<string, unknown> | undefined) ?? {}).sort()).toStrictEqual([
    "blacklist",
    "enabled",
    "minLength",
  ]);
});
