// CT: the "Streaming" SECTION (SET-SEAMS stage 2) — the second chat-owned section of the decomposed
// chat-behavior pane. Drives the production autosave path: `getUserSettings` seeds the form, each control
// change debounces then fires `updateUserSettingsSection("chat")`.
//
// P1 — PATCH MINIMALITY (SET-SEAMS §9): the wire payload carries EXACTLY this section's three owned keys and
// none of the sibling message-handling section's. The expected key set is re-spelled here on purpose —
// importing the section's own `OWNS` tuple would make the test agree with the code by construction.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatStreamingSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_streaming", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["smoothStream", "smoothStreamCps", "streamScrollMode"];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
}

/** The most recent `chat` section-patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "chat" ? input.patch : undefined;
}

test("mounts with the persisted defaults rendered (Follow, smooth streaming off)", async ({ mount, page }) => {
  await stub(page);
  await mount(<ChatStreamingSectionStory />);
  await expect(page.getByRole("heading", { name: "Streaming" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "While a reply streams" })).toContainText("Follow the reply");
  await expect(page.getByRole("switch", { name: "Smooth streaming" })).not.toBeChecked();
});

test("picking Pin patches streamScrollMode with ONLY this section's three keys (PD-147)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatStreamingSectionStory />);
  await page.getByRole("combobox", { name: "While a reply streams" }).click();
  await page.getByRole("option", { name: "Pin my message to the top" }).click();

  await expect.poll(() => lastPatch(trpc)?.["streamScrollMode"], { intervals: [20, 50, 100] }).toBe("pin-prompt");
  // P1: no message-handling key rides along — a full-blob patch would carry a stale `autoSwipe`/`enterSends`
  // and clobber whatever that section just saved (SET-SEAMS §2.1).
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
  expect("enterSends" in (lastPatch(trpc) ?? {})).toBe(false);
});

test("the reveal-speed slider is gated behind the smooth-streaming toggle, then patches smoothStream", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatStreamingSectionStory />);
  await expect(page.getByRole("slider", { name: "Reveal speed (chars/sec)" })).toHaveCount(0);
  await page.getByRole("switch", { name: "Smooth streaming" }).click();
  await expect(page.getByRole("slider", { name: "Reveal speed (chars/sec)" })).toBeVisible();

  await expect.poll(() => lastPatch(trpc)?.["smoothStream"], { intervals: [20, 50, 100] }).toBe(true);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});
