// CT: the real Chat-behavior settings pane (PD-146 — chat-behavior-settings-surface.tsx). Drives the
// production autosave path: `getUserSettings` seeds the projected form, each control change debounces then
// fires `updateUserSettingsSection("chat")` with the FULL chat-section patch (createAutosaveEntityForm
// submits the whole form value). The two list fields (blacklist + stopping strings) edit as newline text
// and project back to `string[]`. autoSwipe detail + reveal-speed fields are gated behind their toggles.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatBehaviorSettingsStory } from "../_ct-stories";

const SETTINGS_VIEW = {
  userId: "user_ct_chat_behavior",
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

/** The most recent chat-section patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "chat" ? input.patch : undefined;
}

test("mounts with the persisted defaults rendered (Enter-to-send on, smooth streaming off)", async ({ mount, page }) => {
  await stub(page);
  await mount(<ChatBehaviorSettingsStory />);
  await expect(page.getByRole("switch", { name: "Enter to send" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Smooth streaming" })).not.toBeChecked();
});

test("toggling Enter-to-send patches the chat section with enterSends", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatBehaviorSettingsStory />);
  await page.getByRole("switch", { name: "Enter to send" }).click();
  await expect.poll(() => lastPatch(trpc)?.["enterSends"], { intervals: [20, 50, 100] }).toBe(false);
});

test("Send-continues-the-reply patches continueOnSend", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatBehaviorSettingsStory />);
  await page.getByRole("switch", { name: "Send continues the reply" }).click();
  await expect.poll(() => lastPatch(trpc)?.["continueOnSend"], { intervals: [20, 50, 100] }).toBe(false);
});

test("Empty-Enter-generates patches generateOnEmptySend (W-E)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatBehaviorSettingsStory />);
  await page.getByRole("switch", { name: "Empty Enter generates a reply" }).click();
  await expect.poll(() => lastPatch(trpc)?.["generateOnEmptySend"], { intervals: [20, 50, 100] }).toBe(false);
});

test("custom stopping strings: newline text projects back to a string[] patch", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatBehaviorSettingsStory />);
  await page.getByRole("textbox", { name: "Custom stopping strings" }).fill("###\nEND");
  await expect.poll(() => lastPatch(trpc)?.["customStoppingStrings"], { intervals: [20, 50, 100] }).toEqual(["###", "END"]);
});

test("auto-swipe detail fields are gated behind the auto-swipe toggle", async ({ mount, page }) => {
  await stub(page);
  await mount(<ChatBehaviorSettingsStory />);
  // Hidden by default (auto-swipe off).
  await expect(page.getByRole("textbox", { name: "Blacklisted phrases" })).toHaveCount(0);
  await page.getByRole("switch", { name: "Auto-swipe short replies" }).click();
  await expect(page.getByRole("textbox", { name: "Blacklisted phrases" })).toBeVisible();
});

test("stream scroll mode: picking Pin patches streamScrollMode=pin-prompt (PD-147)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatBehaviorSettingsStory />);
  // Defaults to Follow.
  await expect(page.getByRole("combobox", { name: "While a reply streams" })).toContainText("Follow the reply");
  await page.getByRole("combobox", { name: "While a reply streams" }).click();
  await page.getByRole("option", { name: "Pin my message to the top" }).click();
  await expect.poll(() => lastPatch(trpc)?.["streamScrollMode"], { intervals: [20, 50, 100] }).toBe("pin-prompt");
});

test("smooth-stream reveal speed is gated behind the smooth-streaming toggle, then patches smoothStream", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatBehaviorSettingsStory />);
  // Reveal-speed slider hidden until smooth streaming is on.
  await expect(page.getByRole("slider", { name: "Reveal speed (chars/sec)" })).toHaveCount(0);
  await page.getByRole("switch", { name: "Smooth streaming" }).click();
  await expect(page.getByRole("slider", { name: "Reveal speed (chars/sec)" })).toBeVisible();
  await expect.poll(() => lastPatch(trpc)?.["smoothStream"], { intervals: [20, 50, 100] }).toBe(true);
});
