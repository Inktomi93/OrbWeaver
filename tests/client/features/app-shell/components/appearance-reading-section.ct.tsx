// CT: the "Reading typography" appearance SECTION (SET-SEAMS stage 1) — an app-shell-owned section of the
// decomposed appearance pane. Before the split this fragment took the pane's ONE welded autosave form as a
// prop and had no write of its own; it owns its read, its session and its key-minimal write now.
//
// P1 (SET-SEAMS §9): the `appearance` section-patch carries EXACTLY the six owned keys.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AppearanceReadingSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_reading", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["justifyBodyText", "readingBodyScale", "readingLetterSpacing", "readingLineHeight", "readingNameScale", "readingParagraphSpacing"];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
}

function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "appearance" ? input.patch : undefined;
}

test("mounts with the persisted reading defaults rendered", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceReadingSectionStory />);
  await expect(page.getByRole("heading", { name: "Reading typography" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Line height" })).toHaveAttribute("aria-valuenow", String(DEFAULT_USER_SETTINGS.appearance.readingLineHeight));
});

test("moving line height patches readingLineHeight with ONLY the six reading keys", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceReadingSectionStory />);
  const slider = page.getByRole("slider", { name: "Line height" });

  await slider.press("Home");
  await expect.poll(() => lastPatch(trpc)?.["readingLineHeight"], { intervals: [20, 50, 100] }).toBeDefined();
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

test("the justify switch patches justifyBodyText, still key-minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceReadingSectionStory />);
  await page.getByRole("switch", { name: "Justify message text" }).click();

  await expect.poll(() => lastPatch(trpc)?.["justifyBodyText"], { intervals: [20, 50, 100] }).toBe(true);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});
