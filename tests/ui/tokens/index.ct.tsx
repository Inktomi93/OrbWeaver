// Pointer-conditional control-height floor — the COARSE half of gate touch-target-floor (D62 P1,
// UI-Arch §4b axis 3). The freshness test (index.test.ts) proves the emitted CSS carries the coarse
// @theme floor + the @media(pointer:fine) override; THIS proves the cascade lands in a real browser:
// under a coarse pointer an interactive control's box is the ≥44px touch floor (not the 28px fine
// scale). `hasTouch: true` flips `matchMedia("(pointer: coarse)")` in chromium (verified), so the
// coarse `@theme` value wins over the unlayered fine override. Expected height is DERIVED from the
// generated TOKENS map (§13.7 contract — never a hardcoded literal); providers inject via beforeMount.
import { Button } from "@orb/ui/button";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

// Coarse-pointer emulation: a touch-capable context reports `pointer: coarse`, so the @media override
// does NOT apply and control heights sit on the ≥44px floor.
test.use({ hasTouch: true });

// The floor, in px, straight from the token (coarse `value` = the @theme literal): 2.75rem → 44px.
const FLOOR_PX = `${Number.parseFloat(TOKENS["spacing.touch-target"].value) * 16}px`;

test("a coarse pointer keeps an interactive control on the ≥44px touch floor", async ({ mount, page }) => {
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  expect(coarse, "the CT context must emulate a coarse pointer (hasTouch)").toBe(true);

  // Button size="sm" rides h-control-sm — the token that narrows to 28px on fine pointers.
  const component = await mount(<Button size="sm">Delete</Button>);

  // The cascade resolves the coarse @theme value (= the touch floor), not the fine 28px override.
  await expect(component).toHaveCSS("height", FLOOR_PX);
  const box = await component.boundingBox();
  expect(box?.height, "the rendered control box meets the ≥44px floor on coarse").toBeGreaterThanOrEqual(44);
});
