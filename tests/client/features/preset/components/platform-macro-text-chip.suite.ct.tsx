// A preset's macro text prints each `{{macro}}` as an info InlineToken: the info tint and its on-tint ink, side padding at the
// tight step, and a tint that stands apart from the frame it sits in, under each seed.
import { oklabDistance, srgbToOklch, TONE_TINT_SEPARATION } from "@orb/kit/theme-derivation";
import { computedStyle, pixelSurface } from "@orb/testkit/browser/spec";
import { SEED_THEME_NAMES } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { MacroTextStory } from "./_macro-text-stories.tsx";

const STORY = "tests/client/features/preset/components/_macro-text-stories/MacroTextStory";
const THEMES = [undefined, ...SEED_THEME_NAMES] as const;

for (const theme of THEMES) {
  test(`${theme ?? "hearth"}: each macro chip wears the info tint and ink, pads its sides at the tight step and stands apart from its frame`, async ({
    mount,
    page,
  }) => {
    const root = await mount<typeof MacroTextStory>(STORY, theme === undefined ? {} : { theme });
    const tint = await computedStyle(root.locator('[data-probe="info-tint"]'), "background-color");
    const ink = await computedStyle(root.locator('[data-probe="info-ink"]'), "color");
    const tight = await computedStyle(root.locator('[data-probe="tight"]'), "inline-size");
    for (const frame of ["quoted", "bare"]) {
      const chips = root.locator(`[data-frame="${frame}"] [data-slot="badge"]`);
      await expect(chips, `${frame}: a chip per macro`).toHaveCount(2);
      const first = chips.first();
      expect(await computedStyle(first, "background-color"), `${frame}: tint`).toBe(tint);
      expect(await computedStyle(first, "color"), `${frame}: ink`).toBe(ink);
      expect(await computedStyle(first, "padding-inline-start"), `${frame}: padding`).toBe(tight);
      const chip = await pixelSurface(page, first, { region: { x0: 0.3, x1: 0.7, y0: 0.05, y1: 0.2 } });
      const frameFill = await pixelSurface(page, root.locator(`[data-frame="${frame}"]`), { region: { x0: 0.01, x1: 0.02, y0: 0.01, y1: 0.05 } });
      expect(oklabDistance(srgbToOklch(chip.rgb), srgbToOklch(frameFill.rgb)), `${frame}: ${chip.describe} on ${frameFill.describe}`).toBeGreaterThanOrEqual(
        TONE_TINT_SEPARATION,
      );
    }
  });
}
