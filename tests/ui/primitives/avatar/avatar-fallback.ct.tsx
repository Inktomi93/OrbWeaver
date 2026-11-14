// An avatar with no picture draws its initials at a share of its own box and a depth pigment under them, at every size
// from the small chip to a card portrait, and the initials stay readable on every seed palette.
import { AA_NORMAL_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { PIGMENTS, SEED_THEME_NAMES, TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import { CARD_PORTRAIT_WIDTH_PX, HUE_SEEDS, TOKEN_SIZES } from "./_avatar-fallback-cases.ts";
import type { AvatarFallbackStory, AvatarFallbackThemesStory } from "./_avatar-fallback-stories.tsx";

const STORY = "tests/ui/primitives/avatar/_avatar-fallback-stories/AvatarFallbackStory";
const THEMES_STORY = "tests/ui/primitives/avatar/_avatar-fallback-stories/AvatarFallbackThemesStory";
const FALLBACK = '[data-slot="avatar-fallback"]';
// The share of its shorter side the initials fill, named by the token that sets it.
const SHARE = Number(TOKENS["immersive.initial-cqmin"].value) / 100;
const PHONE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;
const SIZED_CASES = [...TOKEN_SIZES, "card"] as const;

for (const [name, viewport, hasTouch] of [
  ["a phone with a touch pointer", PHONE, true],
  ["a desktop", DESKTOP, false],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch });

    for (const size of SIZED_CASES) {
      test(`the ${size} fallback sets its initials to the token's share of its box`, async ({ mount }) => {
        const component = await mount<typeof AvatarFallbackStory>(STORY, { sizes: TOKEN_SIZES, cardWidth: CARD_PORTRAIT_WIDTH_PX });
        const fallback = component.locator(`[data-case="${size}"] ${FALLBACK}`);
        await expect(fallback).toBeVisible();
        const share = await fallback.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return Number.parseFloat(getComputedStyle(element, "::before").fontSize) / Math.min(box.width, box.height);
        });
        expect(share).toBeCloseTo(SHARE, 2);
      });
    }
  });
}

test("a card portrait's fallback fills the card's width", async ({ mount }) => {
  const component = await mount<typeof AvatarFallbackStory>(STORY, { sizes: TOKEN_SIZES, cardWidth: CARD_PORTRAIT_WIDTH_PX });
  const box = await component.locator(`[data-case="card"] ${FALLBACK}`).boundingBox();
  expect(box?.width).toBe(CARD_PORTRAIT_WIDTH_PX);
});

for (const palette of ["base", ...SEED_THEME_NAMES] as const) {
  test(`${palette}: every fill's depth pigment keeps the initials above the text floor and no closer than the fill`, async ({ mount }) => {
    const component = await mount<typeof AvatarFallbackThemesStory>(THEMES_STORY, { seeds: HUE_SEEDS });
    const fallbacks = component.locator(`[data-palette="${palette}"] ${FALLBACK}`);
    await expect(fallbacks).toHaveCount(HUE_SEEDS.length);
    const reads = await fallbacks.evaluateAll((nodes, depthVar) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) {
        throw new Error("No 2d context to resolve colours through");
      }
      // The engine converts every CSS colour syntax, oklch included, to the bytes the glyph is painted in.
      const bytes = (css: string): { r: number; g: number; b: number } => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = css;
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
        return { r, g, b };
      };
      return nodes.map((node) => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = `var(${depthVar})`;
        node.append(probe);
        const depth = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const style = getComputedStyle(node);
        return { ink: bytes(style.color), fill: bytes(style.backgroundColor), depth: bytes(depth), image: style.backgroundImage };
      });
    }, PIGMENTS.avatar.depth);
    for (const read of reads) {
      expect(read.image).toContain("radial-gradient");
      const onFill = wcagContrastRatio(read.ink, read.fill);
      const onDepth = wcagContrastRatio(read.ink, read.depth);
      expect(onFill).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      expect(onDepth).toBeGreaterThanOrEqual(onFill);
    }
  });
}
