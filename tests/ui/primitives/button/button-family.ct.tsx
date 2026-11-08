// D336 step four: GlyphButton, InlineAction and PictureButton each draw their own box through their own door, and take
// the busy, disabled, focal and tone states from the one Button core. Tones under each seed live in the tone-variant matrix.

import { BUTTON_BOX_STEPS } from "@orb/ui/button/box-hit-area";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ButtonFamilyBoxesStory, ButtonFamilyStatesStory } from "./_button-family-stories.tsx";

const STORIES = "tests/ui/primitives/button/_button-family-stories";

function style(locator: Locator, property: string, pseudo?: "::before"): Promise<string> {
  return locator.evaluate((element, [name, from]) => getComputedStyle(element, from).getPropertyValue(name), [property, pseudo ?? null] as const);
}

test("each glyph step is its token's square, carries the touch-target hit area and stamps its step", async ({ mount }) => {
  const component = await mount<typeof ButtonFamilyBoxesStory>(`${STORIES}/ButtonFamilyBoxesStory`, {});
  const touchTarget = await style(component.locator('[data-probe="touch-target"]'), "block-size");
  for (const glyph of BUTTON_BOX_STEPS.glyphButton) {
    const button = component.getByRole("button", { name: `Glyph ${glyph}`, exact: true });
    const probe = component.locator(`[data-probe="glyph-${glyph}"]`);
    await expect(button).toHaveAttribute("data-slot", "button");
    await expect(button).toHaveAttribute("data-glyph", glyph);
    expect(await style(button, "inline-size"), glyph).toBe(await style(probe, "inline-size"));
    expect(await style(button, "block-size"), glyph).toBe(await style(probe, "block-size"));
    expect(await style(button, "block-size", "::before"), glyph).toBe(touchTarget);
  }
});

test("each inline step is text-height at its type step and carries the touch-target hit area", async ({ mount }) => {
  const component = await mount<typeof ButtonFamilyBoxesStory>(`${STORIES}/ButtonFamilyBoxesStory`, {});
  const touchTarget = await style(component.locator('[data-probe="touch-target"]'), "block-size");
  for (const step of BUTTON_BOX_STEPS.inlineAction) {
    const action = component.getByRole("button", { name: `Inline ${step}`, exact: true });
    const probe = component.locator(`[data-probe="inline-${step}"]`);
    await expect(action).toHaveAttribute("data-step", step);
    expect(await style(action, "font-size"), step).toBe(await style(probe, "font-size"));
    expect(await style(action, "block-size"), step).toBe(await style(probe, "line-height"));
    expect(await style(action, "block-size", "::before"), step).toBe(touchTarget);
  }
});

test("a picture button is its picture's box: the bare one draws nothing and dims on hover, the ghost one tints", async ({ mount, page }) => {
  // Tailwind's `hover:` applies only under `(hover: hover)`, so a touch device keeps both pictures at rest.
  const hovers = await page.evaluate((hoverCapable) => matchMedia(hoverCapable).matches, MEDIA_QUERIES["hover-capable"]);
  const component = await mount<typeof ButtonFamilyBoxesStory>(`${STORIES}/ButtonFamilyBoxesStory`, {});
  const bare = component.getByRole("button", { name: "Bare picture", exact: true });
  const ghost = component.getByRole("button", { name: "Ghost picture", exact: true });
  const twin = component.locator('[data-slot="avatar-root"]').last();
  expect(await bare.evaluate((element) => element.getBoundingClientRect().height)).toBe(
    await twin.evaluate((element) => element.getBoundingClientRect().height),
  );
  await expect(bare).not.toHaveAttribute("data-variant");
  await expect(ghost).toHaveAttribute("data-variant", "ghost");
  const transparent = await style(component.locator('[data-probe="transparent"]'), "background-color");
  await page.mouse.move(0, 0);
  expect(await style(bare, "background-color")).toBe(transparent);
  expect(await style(bare, "opacity")).toBe("1");
  await bare.hover();
  const hoverOpacity = await style(component.locator('[data-probe="hover-opacity"]'), "opacity");
  expect(hoverOpacity, "the hover step dims").not.toBe("1");
  await expect.poll(() => style(bare, "opacity")).toBe(hovers ? hoverOpacity : "1");
  await ghost.hover();
  await expect.poll(async () => (await style(ghost, "background-color")) !== transparent, "the ghost tints exactly when the device hovers").toBe(hovers);
});

test("every member takes the core's focal, busy and disabled states", async ({ mount }) => {
  const component = await mount<typeof ButtonFamilyStatesStory>(`${STORIES}/ButtonFamilyStatesStory`, {});
  await expect(component.getByRole("button", { name: "Focal glyph", exact: true })).toHaveAttribute("data-cta", "");
  await expect(component.getByRole("button", { name: "Quiet glyph", exact: true })).not.toHaveAttribute("data-cta");
  const busy = component.getByRole("button", { name: "Busy glyph", exact: true });
  await expect(busy).toHaveAttribute("aria-busy", "true");
  await expect(busy).toBeDisabled();
  await expect(component.getByRole("button", { name: "Disabled inline", exact: true })).toBeDisabled();
  await expect(component.getByRole("button", { name: "Destructive link", exact: true })).toHaveAttribute("data-tone", "destructive");
});
