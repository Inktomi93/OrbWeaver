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
  // The absorbed controls survived the merge — and density/elevation are SEGMENTS now (#866 §7.8, the
  // seen-not-read rebuilds): every option visible at rest, the persisted value the pressed one.
  const density = page.getByRole("group", { name: "Density" });
  await expect(density.getByRole("button", { name: "Comfortable" })).toHaveAttribute("aria-pressed", "true");
  await expect(density.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "false");
  // …and elevation is ILLUSTRATED CARDS (the preview-vs-illustration ruling): diagram + label per
  // option, the persisted value pressed.
  const elevation = page.locator('[data-slot="elevation-cards"]');
  await expect(elevation.getByRole("button", { name: "Flat" })).toHaveAttribute("aria-pressed", "true");
  await expect(elevation.getByRole("button")).toHaveCount(3);
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

test("the density segment patches density and nothing else — and the LIVE preview reads the DRAFT", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSizingSectionStory />, { hooksConfig: { theme: { density: "compact" } } });
  const preview = page.locator('[data-slot="density-preview"]');
  await expect(preview).toHaveAttribute("data-density", "comfortable");

  const readSpacing = (): Promise<readonly string[]> =>
    preview.evaluate((element) => {
      const style = getComputedStyle(element);
      return ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"].map((name) => style.getPropertyValue(name).trim());
    });
  const comfortable = await readSpacing();

  await page.getByRole("group", { name: "Density" }).getByRole("button", { name: "Compact" }).click();

  // THE PREVIEW IS DRAFT-DRIVEN, and derived: its box re-scopes the SAME tiers.css spacing intents the
  // shell grid reads (one definition, two consumers — the owner's derive-never-mirror rider), so the
  // attribute flip below IS the visual change, immediately, before any save lands.
  await expect(preview).toHaveAttribute("data-density", "compact");
  // …and the tokens actually re-scope: compact's row gap reads off the RENDERED box (the CSS hoist is
  // the mechanism under test — a preview that swapped an attribute nothing styles would be a fake).
  await expect.poll(() => preview.evaluate((el: HTMLElement) => getComputedStyle(el).rowGap)).toBe("6px"); // compact row = the canonical field step
  const compact = await readSpacing();
  expect(compact).not.toEqual(comfortable);
  await expect.poll(() => lastPatch(trpc)?.["density"], { intervals: [20, 50, 100] }).toBe("compact");
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);

  await page.getByRole("group", { name: "Density" }).getByRole("button", { name: "Comfortable" }).click();
  await expect(preview).toHaveAttribute("data-density", "comfortable");
  await expect.poll(readSpacing).toEqual(comfortable);
});

test("an elevation CARD patches elevation, key-minimally — and its diagram derives the shell's tokens", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<AppearanceSizingSectionStory />);
  const cards = page.locator('[data-slot="elevation-cards"]');
  await cards.getByRole("button", { name: "Layered" }).click();

  await expect.poll(() => lastPatch(trpc)?.["elevation"], { intervals: [20, 50, 100] }).toBe("ramp");
  expect(Object.keys(lastPatch(trpc) ?? {}).sort()).toStrictEqual(OWNED_KEYS);

  // The diagram is DERIVED, not drawn in hex: ramp's middle cell paints the shell's own
  // `--color-surface-raised`, read off the rendered box against the live token (the derive rider's pin).
  const rampMiddle = cards.getByRole("button", { name: "Layered" }).locator(".bg-surface-raised");
  await expect(rampMiddle).toHaveCount(1);
  await expect
    .poll(() =>
      rampMiddle.evaluate((el: HTMLElement): boolean => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--color-surface-raised)";
        document.body.appendChild(probe);
        const tokenBg = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return getComputedStyle(el).backgroundColor === tokenBg;
      }),
    )
    .toBe(true);
});
