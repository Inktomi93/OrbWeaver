// @subject packages/ui/src/primitives/collapsible/variants.ts
// An inline hint trigger bleeds past its row and a folding panel's clip makes room for that bleed: at the first and the last row of
// an open panel, at a fine pointer, at standard and enlarged text and under reduced motion, every edge of the trigger's square paints
// and takes a press. A shut panel paints none of it, unmounted or kept mounted.
import { resolvedLength, LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { hintTriggerName } from "#ui/primitives/hint-trigger/hint-trigger-names.ts";
import type { HintClipEdgeStory } from "./_clip-edge-stories.tsx";

const STORY = "tests/ui/primitives/hint-trigger/_clip-edge-stories/HintClipEdgeStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const SUBJECT = "Word bias";
// One pixel in from a box edge: the outermost row of pixels the square owns.
const EDGE_INSET_PX = 1;

test.use({ viewport: { width: 1280, height: 900 } });

/** Whether the press at each block edge of the trigger's square lands on the trigger: a clipped edge neither paints nor hit-tests. */
async function edgesTakePresses(trigger: Locator): Promise<{ readonly top: boolean; readonly bottom: boolean }> {
  return await trigger.evaluate((node, inset) => {
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const lands = (y: number): boolean => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && (hit === node || node.contains(hit));
    };
    return { top: lands(box.top + inset), bottom: lands(box.bottom - inset) };
  }, EDGE_INSET_PX);
}

const CASES = [
  { name: "100% text", factor: 1, reducedMotion: "no-preference" },
  { name: "200% text", factor: 2, reducedMotion: "no-preference" },
  { name: "reduced motion", factor: 1, reducedMotion: "reduce" },
] as const;

for (const { name, factor, reducedMotion } of CASES) {
  test(`at ${name} each inline hint trigger's square takes a press at both block edges of the panel`, async ({ mount, page }) => {
    await page.emulateMedia({ reducedMotion, colorScheme: "light", forcedColors: "none", contrast: "no-preference" });
    const component = await mount<typeof HintClipEdgeStory>(STORY, { subject: SUBJECT });
    await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
    const panel = component.locator('[data-slot="collapsible-panel"]');
    const triggers = component.getByRole("button", { name: hintTriggerName(SUBJECT), exact: true });
    await expect(triggers).toHaveCount(2);
    // The fold animates its height; a box read mid-fold is not the open panel.
    await expect.poll(() => panel.evaluate((node) => node.getAnimations().length)).toBe(0);
    const square = await resolvedLength(page, `var(${TOKENS["size.glyph-md"].cssVar})`, panel);
    const edge = await panel.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    });
    const [first, last] = await triggers.all();
    if (first === undefined || last === undefined) {
      throw new Error("the story renders two hinted rows");
    }
    const firstBox = await first.boundingBox();
    const lastBox = await last.boundingBox();
    // Positive control: the squares do cross the panel's own box, so the clip edge is what this case judges.
    expect(firstBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(edge.top - SUBPIXEL);
    expect((lastBox?.y ?? 0) + (lastBox?.height ?? 0)).toBeGreaterThan(edge.bottom + SUBPIXEL);
    for (const trigger of [first, last]) {
      // The whole target square, not a box shrunk to fit its line.
      expect((await trigger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(square - SUBPIXEL);
      expect(await edgesTakePresses(trigger)).toEqual({ top: true, bottom: true });
    }
  });
}

for (const keepMounted of [false, true]) {
  test(`a shut panel ${keepMounted ? "kept mounted" : "unmounted"} paints none of its hinted rows`, async ({ mount, page }) => {
    const component = await mount<typeof HintClipEdgeStory>(STORY, { subject: SUBJECT, keepMounted });
    const triggers = component.getByRole("button", { name: hintTriggerName(SUBJECT), exact: true, includeHidden: true });
    // Positive control: open, both rows render.
    await expect(triggers).toHaveCount(2);
    await page.getByRole("button", { name: "Options", exact: true }).click();
    const panel = component.locator('[data-slot="collapsible-panel"]');
    // Shut, the panel is gone, or kept as a `hidden` box whose rows paint nothing.
    await expect(panel).toHaveCount(keepMounted ? 1 : 0);
    await expect(triggers).toHaveCount(keepMounted ? 2 : 0);
    for (const trigger of await triggers.all()) {
      await expect(trigger).toBeHidden();
    }
  });
}
