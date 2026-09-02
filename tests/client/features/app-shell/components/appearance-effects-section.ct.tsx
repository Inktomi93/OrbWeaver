// CT: the Effects appearance SECTION (SET-SEAMS stage 1) — an app-shell-owned section of the decomposed
// appearance pane. Keeps the Effects-redesign pin (owner ruling: the frosted-glass surfaces are independent
// SWITCH rows, never a ToggleGroup) and adds P1 (SET-SEAMS §9): the `appearance` section-patch carries
// EXACTLY the five owned keys.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { AppearanceEffectsSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = { userId: "user_ct_effects", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const UPDATE_PROC = "settings.updateUserSettingsSection";
const OWNED_KEYS = ["blurStrength", "blurSurfaces", "enableThemeColorization", "shadowEffects", "surfaceTexture"];
const FROSTED_GLASS_GLOSS_RE = /Backdrop blur plus a translucent fill/;

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

test("the Frosted glass explanation holds a deliberate prose measure on a wide settings column", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceEffectsSectionStory width={1200} />);
  const gloss = page.getByText(FROSTED_GLASS_GLOSS_RE);
  await expect(gloss).toBeVisible();

  const readMeasureAtAssertion = async (): Promise<typeof measure> =>
    await gloss.evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.display = "block";
      probe.style.font = style.font;
      probe.style.width = "1ch";
      document.body.append(probe);
      const ch = probe.getBoundingClientRect().width;
      probe.remove();
      return { chars: element.getBoundingClientRect().width / ch, lines: element.getClientRects().length };
    });
  const measure = await gloss.evaluate((element) => {
    const style = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.display = "block";
    probe.style.font = style.font;
    probe.style.width = "1ch";
    document.body.append(probe);
    const ch = probe.getBoundingClientRect().width;
    probe.remove();
    return { chars: element.getBoundingClientRect().width / ch, lines: element.getClientRects().length };
  });

  await expect.poll(async () => (await readMeasureAtAssertion()).chars).toBeGreaterThanOrEqual(65);
  await expect.poll(async () => (await readMeasureAtAssertion()).chars).toBeLessThanOrEqual(75);
});

test("the Frosted glass explanation stays contained on mobile without moving the switch rail", async ({ mount, page }) => {
  await stub(page);
  await mount(<AppearanceEffectsSectionStory width={390} />);
  const gloss = page.getByText(FROSTED_GLASS_GLOSS_RE);
  const section = page.locator("#config-anchor-appearance-effects");
  // THE GLOSS IS THE FIRST SENTENCE, deliberately (#932 E5): the row states WHAT the setting is and the
  // teacher pane carries the rest — "Messages carry glass poorly …" is the second sentence and lives
  // there. Before #932 no gloss rendered at all, which is why this file's two prose-measure tests were
  // RED on main (proven by a two-arm control, 2026-09-02) against a `+` spelling the product replaced
  // with "plus" back at the S3 teacher commit.
  await expect(gloss).toContainText("Backdrop blur plus a translucent fill on the surfaces you pick.");
  await expect(section).toHaveCount(1);

  const readGeometryAtAssertion = async (): Promise<typeof geometry> =>
    await page.evaluate(() => {
      const sectionElement = document.querySelector("#config-anchor-appearance-effects");
      const glossElement = Array.from(document.querySelectorAll("p")).find((element) => element.textContent?.startsWith("Backdrop blur plus"));
      const switchElements = Array.from(document.querySelectorAll<HTMLElement>('[role="switch"]'));
      if (!(sectionElement instanceof HTMLElement && glossElement instanceof HTMLElement) || switchElements.length === 0) {
        throw new Error("missing Effects geometry target");
      }
      const sectionBox = sectionElement.getBoundingClientRect();
      const glossBox = glossElement.getBoundingClientRect();
      const switchRights = switchElements.map((element) => element.getBoundingClientRect().right);
      return {
        contained: glossBox.left >= sectionBox.left && glossBox.right <= sectionBox.right,
        switchRailSpread: Math.max(...switchRights) - Math.min(...switchRights),
      };
    });
  const geometry = await page.evaluate(() => {
    const sectionElement = document.querySelector("#config-anchor-appearance-effects");
    const glossElement = Array.from(document.querySelectorAll("p")).find((element) => element.textContent?.startsWith("Backdrop blur plus"));
    const switchElements = Array.from(document.querySelectorAll<HTMLElement>('[role="switch"]'));
    if (!(sectionElement instanceof HTMLElement && glossElement instanceof HTMLElement) || switchElements.length === 0) {
      throw new Error("missing Effects geometry target");
    }
    const sectionBox = sectionElement.getBoundingClientRect();
    const glossBox = glossElement.getBoundingClientRect();
    const switchRights = switchElements.map((element) => element.getBoundingClientRect().right);
    return {
      contained: glossBox.left >= sectionBox.left && glossBox.right <= sectionBox.right,
      switchRailSpread: Math.max(...switchRights) - Math.min(...switchRights),
    };
  });
  await expect.poll(async () => (await readGeometryAtAssertion()).contained).toBe(true);
  await expect.poll(async () => (await readGeometryAtAssertion()).switchRailSpread).toBeLessThanOrEqual(1);
});
