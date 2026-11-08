// A read-only switch says so with a lock on its thumb, and the lock is the state's only non-colour signal: measured from
// the framebuffer, the glyph's painted colour holds the 3:1 non-text floor against the thumb fill it sits on, in every
// state, on every seed and both pane hosts. The OFF thumb is dimmed and the glyph dims with it, so the ratio is read off
// the pixels that reach the screen, not off the authored colours.
import { AA_NON_TEXT_RATIO } from "@orb/kit/theme-derivation";
import { pixelMarkContrast } from "@orb/testkit/browser/spec";
import { SEED_CASES } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import type { SwitchLockGlyphStory } from "./_lock-glyph-stories.tsx";

const STORY = "tests/ui/primitives/switch/_lock-glyph-stories/SwitchLockGlyphStory";
const STATES = ["off", "on accent", "on quiet"] as const;
const HOSTS = ["background", "card"] as const;

for (const { name, ...props } of SEED_CASES) {
  test(`${name}: the lock glyph holds 3:1 against its thumb in every read-only state`, async ({ mount, page }) => {
    const component = await mount<typeof SwitchLockGlyphStory>(STORY, props);
    for (const host of HOSTS) {
      for (const state of STATES) {
        const thumb = component
          .locator(`[data-host="${host}"]`)
          .getByRole("switch", { name: `${state} on ${host}`, exact: true })
          .locator('[data-slot="switch-thumb"]');
        const read = await pixelMarkContrast(page, thumb.locator("svg"), thumb);
        expect.soft(read.ratio, `${state} on ${host}: ${read.describe}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
      }
    }
  });
}
