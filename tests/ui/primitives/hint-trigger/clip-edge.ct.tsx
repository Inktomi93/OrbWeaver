// @subject packages/ui/src/primitives/hint-trigger/variants.ts
// An inline hint trigger seats its whole press target in its own row, so a box that clips the row cuts none of it: at the first and
// the last row of an open collapsible panel, at a fine pointer, at standard and enlarged text.
import { resolvedLength, LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import { hintTriggerName } from "#ui/primitives/hint-trigger/hint-trigger-names.ts";
import type { HintClipEdgeStory } from "./_clip-edge-stories.tsx";

const STORY = "tests/ui/primitives/hint-trigger/_clip-edge-stories/HintClipEdgeStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const SUBJECT = "Word bias";

test.use({ viewport: { width: 1280, height: 900 } });

for (const factor of [1, 2] as const) {
  test(`at ${String(factor * 100)}% text each inline hint trigger lies whole inside the panel that clips its row`, async ({ mount, page }) => {
    const component = await mount<typeof HintClipEdgeStory>(STORY, { subject: SUBJECT });
    await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
    const panel = component.locator('[data-slot="collapsible-panel"]');
    const triggers = component.getByRole("button", { name: hintTriggerName(SUBJECT), exact: true });
    await expect(triggers).toHaveCount(2);
    // The fold animates its height; a box read mid-fold is not the open panel.
    await expect.poll(() => panel.evaluate((node) => node.getAnimations().length)).toBe(0);
    const square = await resolvedLength(page, `var(${TOKENS["size.glyph-md"].cssVar})`, panel);
    const clip = await panel.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, overflowY: getComputedStyle(node).overflowY };
    });
    // Positive control: the panel does clip its block axis, so a box past its edge is cut.
    expect(clip.overflowY).toBe("clip");
    for (const trigger of await triggers.all()) {
      const box = await trigger.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height };
      });
      // The whole target square, not a box shrunk to fit its line.
      expect(box.height).toBeGreaterThanOrEqual(square - SUBPIXEL);
      expect(box.top).toBeGreaterThanOrEqual(clip.top - SUBPIXEL);
      expect(box.bottom).toBeLessThanOrEqual(clip.bottom + SUBPIXEL);
    }
  });
}
