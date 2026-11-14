// @subject packages/ui/src/primitives/collapsible/variants.ts
// An open panel clips only the fold's block axis: the focus ring of a control flush with its inline edge stays whole at the
// phone's enlarged text, and the height transition still hides the content it folds.
import { setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { PanelEdgeStory } from "./_panel-edge-stories.tsx";

const STORY = "tests/ui/primitives/collapsible/_panel-edge-stories/PanelEdgeStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const EDGE = '[data-probe="edge"]';
const PANE = '[data-probe="pane"]';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** The widest shadow spread on `node` (its focus ring stands that far from the border box), and each clip on the way up to the pane that cuts it. */
function ringCuts(node: Element, paneSelector: string): { readonly reach: number; readonly cut: string[] } {
  // A computed shadow lists offset, offset, blur and spread in px, so every fourth length is a spread.
  const lengths = getComputedStyle(node)
    .boxShadow.split(/[\s,]+/u)
    .filter((token) => token.endsWith("px"));
  const reach = Math.max(0, ...lengths.filter((_, index) => index % 4 === 3).map((length) => Number.parseFloat(length)));
  const box = node.getBoundingClientRect();
  const cut: string[] = [];
  for (let up = node.parentElement; up !== null; up = up.parentElement) {
    const style = getComputedStyle(up);
    const clip = up.getBoundingClientRect();
    const sides = [
      { clips: style.overflowX, past: box.left - reach < clip.left, side: "inline start" },
      { clips: style.overflowX, past: box.right + reach > clip.right, side: "inline end" },
      { clips: style.overflowY, past: box.top - reach < clip.top, side: "block start" },
      { clips: style.overflowY, past: box.bottom + reach > clip.bottom, side: "block end" },
    ];
    const name = up.getAttribute("data-slot") ?? up.tagName.toLowerCase();
    cut.push(...sides.filter(({ clips, past }) => clips !== "visible" && past).map(({ side }) => `${name} clips the ring on the ${side}`));
    if (up.matches(paneSelector)) {
      break;
    }
  }
  return { reach, cut };
}

test("the focus ring of a control flush with an open panel's inline edge lies inside every clip box", async ({ mount, page }) => {
  const component = await mount<typeof PanelEdgeStory>(STORY, {});
  await setRootFontScale(page, FONT_SCALE_PROPERTY, 2);
  const trigger = component.getByRole("button", { name: "Voice options", exact: true });
  const control = component.getByRole("button", { name: "Choose a voice", exact: true });
  await expect(control).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Tab");
  await expect(control).toBeFocused();
  const ring = await control.evaluate(ringCuts, PANE);
  expect(ring.reach).toBeGreaterThan(0);
  expect(ring.cut).toEqual([]);
});

test("the height transition still hides the content it folds", async ({ mount, page }) => {
  const component = await mount<typeof PanelEdgeStory>(STORY, {});
  await setRootFontScale(page, FONT_SCALE_PROPERTY, 2);
  const panel = component.locator('[data-slot="collapsible-panel"]');
  const control = panel.locator(EDGE);
  await expect(control).toBeVisible();
  // Positive control: the control's own centre hits the control while the panel is open.
  const hitsControl = (): Promise<boolean> =>
    panel.evaluate((node, selector) => {
      const edge = node.querySelector(selector);
      if (edge === null) {
        throw new Error("the panel holds no edge control");
      }
      const box = edge.getBoundingClientRect();
      return edge.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    }, EDGE);
  expect(await hitsControl()).toBe(true);
  await component.getByRole("button", { name: "Voice options", exact: true }).click();
  // Hold the fold half way through its transition and look through the box it has shrunk to.
  await expect
    .poll(() =>
      panel.evaluate((node, selector) => {
        const folding = node.getAnimations()[0];
        const edge = node.querySelector(selector);
        if (folding === undefined || edge === null) {
          return null;
        }
        folding.pause();
        folding.currentTime = Number(folding.effect?.getTiming().duration ?? 0) / 2;
        const box = edge.getBoundingClientRect();
        const shrunk = node.getBoundingClientRect().bottom < box.top + box.height / 2;
        return { shrunk, hit: edge.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)) };
      }, EDGE),
    )
    .toEqual({ shrunk: true, hit: false });
});
