// CT: the "Streaming" SECTION (SET-SEAMS stage 2) — the second chat-owned section of the decomposed
// chat-behavior pane. Drives the production autosave path: `getUserSettings` seeds the form, each control
// change debounces then fires `updateUserSettingsSection("chat")`.
//
// P1 — PATCH MINIMALITY (SET-SEAMS §9): the wire payload carries EXACTLY this section's four owned keys and
// none of the sibling message-handling section's. The expected key set is re-spelled here on purpose —
// importing the section's own `OWNS` tuple would make the test agree with the code by construction.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatStreamingSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_streaming", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, configUnreadable: null, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["reasoningAutoCollapse", "smoothStream", "smoothStreamCps", "streamScrollMode"];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => SETTINGS_VIEW });
}

/** The most recent `chat` section-patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "chat" ? input.patch : undefined;
}

test("mounts with the persisted defaults rendered (Follow, smooth streaming ON)", async ({ mount, page }) => {
  await stub(page);
  await mount(<ChatStreamingSectionStory />);
  await expect(page.getByRole("heading", { name: "Streaming" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "While a reply streams" })).toContainText("Follow the reply");
  // Owner ruling 2026-08-09: `smoothStream` ships ON (the #42 fade rides streaming itself, so the knob is
  // pure pacing). The seeded blob IS `DEFAULT_USER_SETTINGS`, so this pins the rendered default, not a stub.
  await expect(page.getByRole("switch", { name: "Smooth streaming" })).toBeChecked();
  // Default ON — the live reasoning disclosure auto-collapses on the first answer token, as it always has.
  await expect(page.getByRole("switch", { name: "Auto-collapse reasoning" })).toBeChecked();
});

test("toggling auto-collapse reasoning patches reasoningAutoCollapse with ONLY this section's owned keys", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatStreamingSectionStory />);
  await page.getByRole("switch", { name: "Auto-collapse reasoning" }).click();

  await expect.poll(() => lastPatch(trpc)?.["reasoningAutoCollapse"], { intervals: [20, 50, 100] }).toBe(false);
  // Patch minimality (SET-SEAMS §2.1): no sibling message-handling key rides along.
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
  expect("enterSends" in (lastPatch(trpc) ?? {})).toBe(false);
});

test("picking Pin patches streamScrollMode with ONLY this section's owned keys (PD-147)", async ({ mount, page }) => {
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

test("the reveal-speed slider is gated on the smooth-streaming toggle, in BOTH directions, and patches smoothStream", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ChatStreamingSectionStory />);
  // The default is now ON, so the gate's OPEN arm is what mounts — drive it OFF first (the direction the
  // old test could not reach), then back ON. Both edges patch, and the slider follows the switch each way.
  await expect(page.getByRole("slider", { name: "Reveal speed (chars/sec)" })).toBeVisible();
  await page.getByRole("switch", { name: "Smooth streaming" }).click();
  await expect(page.getByRole("slider", { name: "Reveal speed (chars/sec)" })).toHaveCount(0);
  await expect.poll(() => lastPatch(trpc)?.["smoothStream"], { intervals: [20, 50, 100] }).toBe(false);

  await page.getByRole("switch", { name: "Smooth streaming" }).click();
  await expect(page.getByRole("slider", { name: "Reveal speed (chars/sec)" })).toBeVisible();
  await expect.poll(() => lastPatch(trpc)?.["smoothStream"], { intervals: [20, 50, 100] }).toBe(true);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});
