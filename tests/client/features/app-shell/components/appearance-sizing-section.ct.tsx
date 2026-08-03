// CT: the "Sizing & motion" appearance SECTION (SET-SEAMS stage 1) — an app-shell-owned section of the
// decomposed appearance pane, and the one that ABSORBED the pane's old `motion` sub plus the
// density/elevation knobs (app-shell reads all five, and §6 makes the reader the owner).
//
// P1 (SET-SEAMS §9): the `appearance` section-patch carries EXACTLY the five owned keys. Slider bounds are
// asserted against the section's OWN exported MIN/MAX constants, never hardcoded numbers.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, FONT_SCALE_MAX, FONT_SCALE_MIN } from "../../../../../packages/client/src/features/app-shell/lib/appearance-bounds.ts";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { AppearanceSizingSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_sizing", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["chatWidthPct", "density", "elevation", "fontScale", "reducedMotion"];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
}

function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "appearance" ? input.patch : undefined;
}

test("renders the sizing sliders AND the absorbed density/elevation/motion controls under one heading", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  await expect(page.getByRole("heading", { name: "Sizing & motion" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Chat width (%)" })).toHaveAttribute("aria-valuenow", String(DEFAULT_USER_SETTINGS.appearance.chatWidthPct));
  await expect(page.getByRole("slider", { name: "Text size", exact: true })).toHaveAttribute(
    "aria-valuenow",
    String(DEFAULT_USER_SETTINGS.appearance.fontScale),
  );
  // The absorbed controls survived the merge: density + elevation (from `message-style`) and reduce-motion
  // (its own retired sub) are all here.
  await expect(page.getByRole("combobox", { name: "Density" })).toContainText("Comfortable");
  await expect(page.getByRole("combobox", { name: "Surface elevation" })).toContainText("Flat");
  await expect(page.getByRole("switch", { name: "Reduce motion" })).toBeVisible();
});

test("chatWidthPct clamps at its own MIN/MAX and patches key-minimally", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  const slider = page.getByRole("slider", { name: "Chat width (%)" });

  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", String(CHAT_WIDTH_MIN));
  await expect.poll(() => lastPatch(trpc)?.["chatWidthPct"], { intervals: [20, 50, 100] }).toBe(CHAT_WIDTH_MIN);

  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", String(CHAT_WIDTH_MAX));
  await expect.poll(() => lastPatch(trpc)?.["chatWidthPct"], { intervals: [20, 50, 100] }).toBe(CHAT_WIDTH_MAX);
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});

test("fontScale clamps at its own MIN/MAX and patches fontScale", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  const slider = page.getByRole("slider", { name: "Text size", exact: true });

  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", String(FONT_SCALE_MIN));
  await expect.poll(() => lastPatch(trpc)?.["fontScale"], { intervals: [20, 50, 100] }).toBe(FONT_SCALE_MIN);

  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuenow", String(FONT_SCALE_MAX));
  await expect.poll(() => lastPatch(trpc)?.["fontScale"], { intervals: [20, 50, 100] }).toBe(FONT_SCALE_MAX);
});

test("the density select patches density and nothing else", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  await page.getByRole("combobox", { name: "Density" }).click();
  await page.getByRole("option", { name: "Compact" }).click();

  await expect.poll(() => lastPatch(trpc)?.["density"], { intervals: [20, 50, 100] }).toBe("compact");
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});
