// CT: the Effects appearance SECTION (SET-SEAMS stage 1) — an app-shell-owned section of the decomposed
// appearance pane. Keeps the Effects-redesign pin (owner ruling: the frosted-glass surfaces are independent
// SWITCH rows, never a ToggleGroup) and adds P1 (SET-SEAMS §9): the `appearance` section-patch carries
// EXACTLY the five owned keys.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { AppearanceEffectsSectionStory } from "../_ct-stories";

const SETTINGS_VIEW = { userId: "user_ct_effects", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["blurStrength", "blurSurfaces", "enableThemeColorization", "shadowEffects", "surfaceTexture"];

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, { "settings.getUserSettings": () => SETTINGS_VIEW, [UPDATE_PROC]: () => ({}) });
}

function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "appearance" ? input.patch : undefined;
}

test("Effects renders switch rows; toggling a surface patches blurSurfaces key-minimally", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceEffectsSectionStory />);

  const panels = page.getByRole("switch", { name: "Side panels" });
  await expect(panels).toBeVisible();
  // Not a toggle-group option (the old ugly control) — a proper switch.
  await expect(page.getByRole("switch", { name: "Prose shadow" })).toBeVisible();

  // Blur ships ON for panels/composer/modals (owner ruling 2026-08-02) — the click REMOVES panels.
  await panels.click();
  await expect.poll(() => lastPatch(trpc)?.["blurSurfaces"], { intervals: [20, 50, 100] }).not.toContain("panels");
  expect(lastPatch(trpc)?.["blurSurfaces"]).toContain("composer");
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);

  // And the OFF→ON direction on a surface the default excludes.
  const messages = page.getByRole("switch", { name: "Messages" });
  await messages.click();
  await expect.poll(() => lastPatch(trpc)?.["blurSurfaces"], { intervals: [20, 50, 100] }).toContain("messages");
});

test("the surface-texture select patches surfaceTexture, still key-minimal", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceEffectsSectionStory />);
  await page.getByRole("combobox", { name: "Surface texture" }).click();
  await page.getByRole("option", { name: "Film grain" }).click();

  await expect.poll(() => lastPatch(trpc)?.["surfaceTexture"], { intervals: [20, 50, 100] }).toBe("grain");
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);
});
