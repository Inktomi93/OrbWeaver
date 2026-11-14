// Focus-ring clipping: where a control's ring lies past a box that clips it. The ring is a box-shadow, so it stands as far from the
// border box as its widest spread and an ancestor that clips an axis cuts it wherever the control is flush with that edge.
import type { Locator } from "@playwright/test";

interface RingCuts {
  /** The widest shadow spread on the control, in px: how far its ring stands from its border box. */
  readonly reach: number;
  /** Each clip on the way up to the pane that the ring crosses, by the box's slot or tag and the side. */
  readonly cut: string[];
}

function readRingCuts(node: Element, paneSelector: string): RingCuts {
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

/** The ring a focused `control` paints and each clip between it and the ancestor matching `paneSelector` that cuts it. */
export function ringCuts(control: Locator, paneSelector: string): Promise<RingCuts> {
  return control.evaluate(readRingCuts, paneSelector);
}
