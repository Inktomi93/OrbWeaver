// @subject packages/ui/src/primitives/accordion/variants.ts
// @subject packages/ui/src/primitives/tooltip/variants.ts
// @subject packages/ui/src/primitives/toggle-group/variants.ts
// @subject packages/ui/src/lib/control-wrap.ts
// @subject packages/ui/src/primitives/text/variants.ts
// Shared primitives at the browser's enlarged text on a phone: an open accordion panel leaves the focus ring of a control flush with its inline
// edge whole, a tooltip breaks a word wider than its measure inside its popup, and an equal-cell toggle strip keeps a one-word label inside its cell.
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, ringCuts, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { AccordionEdgeStory, ToggleGroupFillStory, TooltipLongWordStory, TruncatingSpansStory, WrapControlsStory } from "./_overflow-reflow-stories.tsx";

const STORIES = "tests/ui/primitives/_overflow-reflow-stories";
const PHONE_WIDTH = 390;

test.use({ viewport: { width: PHONE_WIDTH, height: 844 }, hasTouch: true, isMobile: true });

for (const scale of PLATFORM_TEXT_SCALES) {
  test.describe(`at ${String(scale * 100)}% text`, () => {
    test("the focus ring of a control flush with an open accordion panel's inline edge lies inside every clip box", async ({ browserName, mount, page }) => {
      test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
      await using _textSize = await setPlatformTextSize(page, scale);
      const component = await mount<typeof AccordionEdgeStory>(`${STORIES}/AccordionEdgeStory`, {});
      const trigger = component.getByRole("button", { name: "Voice options", exact: true });
      const control = component.getByRole("button", { name: "Choose a voice", exact: true });
      await expect(control).toBeVisible();
      await trigger.focus();
      await page.keyboard.press("Tab");
      await expect(control).toBeFocused();
      const ring = await ringCuts(control, '[data-probe="pane"]');
      expect(ring.reach).toBeGreaterThan(0);
      expect(ring.cut).toEqual([]);
    });

    test("a tooltip popup holds a word wider than its measure", async ({ browserName, mount, page }) => {
      test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
      await using _textSize = await setPlatformTextSize(page, scale);
      await mount<typeof TooltipLongWordStory>(`${STORIES}/TooltipLongWordStory`, {});
      await page.keyboard.press("Tab");
      const popup = page.locator('[data-slot="tooltip-popup"]');
      await expect(popup).toBeVisible();
      // The text's own box against the popup's: a word that does not break paints past the popup's edge.
      await expect
        .poll(() =>
          popup.evaluate((node) => {
            const text = document.createRange();
            text.selectNodeContents(node);
            return Math.max(0, text.getBoundingClientRect().right - node.getBoundingClientRect().right);
          }),
        )
        .toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      const box = await popup.boundingBox();
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(PHONE_WIDTH + LAYOUT_SUBPIXEL_PX);
    });

    test("an equal-cell toggle strip keeps a one-word label inside its cell and its column", async ({ browserName, mount, page }) => {
      test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
      await using _textSize = await setPlatformTextSize(page, scale);
      const component = await mount<typeof ToggleGroupFillStory>(`${STORIES}/ToggleGroupFillStory`, {});
      const column = component.locator('[data-probe="column"]');
      const group = component.getByRole("group", { name: "View mode", exact: true });
      await expect(group).toBeVisible();
      const reach = await group.evaluate((strip) => {
        const host = strip.closest('[data-probe="column"]');
        if (host === null) {
          throw new Error("the strip sits in its column");
        }
        const edge = host.getBoundingClientRect().right;
        const cells = [...strip.querySelectorAll('[data-slot="toggle"]')].map((cell) => {
          const text = document.createRange();
          text.selectNodeContents(cell);
          return Math.max(
            0,
            text.getBoundingClientRect().right - cell.getBoundingClientRect().right,
            cell.getBoundingClientRect().right - strip.getBoundingClientRect().right,
          );
        });
        return { cells, strip: Math.max(0, strip.getBoundingClientRect().right - edge), column: host.scrollWidth - host.clientWidth };
      });
      expect(reach.cells).toHaveLength(2);
      for (const cell of reach.cells) {
        expect(cell).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      }
      expect(reach.strip).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      expect(reach.column).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      await expect(column).toBeVisible();
    });
  });
}

for (const scale of PLATFORM_TEXT_SCALES) {
  test(`at ${String(scale * 100)}% text a Button and a Toggle that wrap break one long word inside their column`, async ({ browserName, mount, page }) => {
    test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
    await using _textSize = await setPlatformTextSize(page, scale);
    const component = await mount<typeof WrapControlsStory>(`${STORIES}/WrapControlsStory`, {});
    const controls = component.locator('[data-probe="column"] button');
    await expect(controls).toHaveCount(2);
    const overshoot = await controls.evaluateAll((nodes) =>
      nodes.map((control) => {
        const host = control.closest('[data-probe="column"]');
        if (host === null) {
          throw new Error("the controls sit in their column");
        }
        const text = document.createRange();
        text.selectNodeContents(control);
        return Math.max(
          0,
          text.getBoundingClientRect().right - control.getBoundingClientRect().right,
          control.getBoundingClientRect().right - host.getBoundingClientRect().right,
        );
      }),
    );
    for (const past of overshoot) {
      expect(past).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    }
  });
}

test("a span that truncates ends inside its parent with an ellipsis, in a paragraph as in a flex row", async ({ mount }) => {
  const component = await mount<typeof TruncatingSpansStory>(`${STORIES}/TruncatingSpansStory`, {});
  for (const probe of ["inline", "flex"] as const) {
    const host = component.locator(`[data-probe="${probe}-host"]`);
    const span = component.locator(`[data-probe="${probe}-span"]`);
    await expect(span).toBeVisible();
    const clip = await span.evaluate((node, hostSelector) => {
      const parent = node.closest(hostSelector);
      if (parent === null) {
        throw new Error("the span sits in its host");
      }
      return {
        pastHost: Math.max(0, node.getBoundingClientRect().right - parent.getBoundingClientRect().right),
        cutByEllipsis: getComputedStyle(node).textOverflow === "ellipsis" && node.scrollWidth > node.clientWidth,
      };
    }, `[data-probe="${probe}-host"]`);
    expect(clip.pastHost, `${probe} host`).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    expect(clip.cutByEllipsis, `${probe} host`).toBe(true);
    await expect(host).toBeVisible();
  }
});
