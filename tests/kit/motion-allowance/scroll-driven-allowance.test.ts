// The scroll-driven allowance admits the fades the ruling covers and nothing else: a CSS animation on a scroll or view
// timeline leaves the time budget only while its property set is empty or holds compositor-safe and mask properties.
// @subject packages/kit/src/motion-allowance/index.ts

import type { SanctionableAnimation } from "@orb/kit/motion-allowance";
import { motionAllowanceOf } from "@orb/kit/motion-allowance";
import { expect, test } from "@orb/testkit/node";

// The rail's scroll fade as the sampler records it: Chromium drops the custom properties it animates.
const SCROLL_FADE = {
  target: "nav[aria-label=Primary]",
  properties: [],
  compositorClean: false,
  attribution: { owner: "application", mechanism: "css-animation" },
  timeline: "scroll",
} as const satisfies SanctionableAnimation;

test("a scroll fade with no readable property, or a mask or compositor-safe one, is admitted on either timeline", () => {
  for (const timeline of ["scroll", "view"] as const) {
    expect(motionAllowanceOf({ ...SCROLL_FADE, timeline })).toBe("scroll-driven");
    expect(motionAllowanceOf({ ...SCROLL_FADE, timeline, properties: ["maskImage", "maskPosition"] })).toBe("scroll-driven");
    expect(motionAllowanceOf({ ...SCROLL_FADE, timeline, properties: ["opacity", "maskSize"] })).toBe("scroll-driven");
  }
});

test("a layout property on a scroll or view timeline counts against the budget, alone or beside a fade", () => {
  for (const timeline of ["scroll", "view"] as const) {
    expect(motionAllowanceOf({ ...SCROLL_FADE, timeline, properties: ["width"] })).toBeNull();
    expect(motionAllowanceOf({ ...SCROLL_FADE, timeline, properties: ["maskImage", "height"] })).toBeNull();
  }
});

test("a scroll fade's own property set on the document clock is not a scroll-driven animation", () => {
  expect(motionAllowanceOf({ ...SCROLL_FADE, timeline: "document" })).toBeNull();
  expect(motionAllowanceOf({ ...SCROLL_FADE, properties: ["maskImage"], timeline: "document" })).toBeNull();
});
