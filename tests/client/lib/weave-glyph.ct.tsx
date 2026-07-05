// CT (hygiene): the WeaveGlyph brand mark after its D62 re-home to lib/. Not gate-required (lib/ is
// outside the @orb/ui primitive-CT contract), but the glyph is now a cross-feature seam, so pin its
// contract: it renders a labelled SVG, honours `size`, and toggles the silk-shimmer class on `anim`.
// The shimmer's CSS lives in the client globals (not the @orb/ui-only CT stylesheet), so this asserts
// the CLASS wiring, not the computed animation — the reduced-motion safety rides the global floor.

import { expect, test } from "@playwright/experimental-ct-react";
import { WeaveGlyph } from "../../../packages/client/src/lib/weave-glyph";

const SHIMMER_CLASS = /orb-weave-shimmer/u;
const PRIMARY_CLASS = /text-primary/u;

test("renders a labelled brand SVG at the requested size", async ({ mount }) => {
  const glyph = await mount(<WeaveGlyph size={48} />);
  const tag = await glyph.evaluate((el) => el.tagName.toLowerCase());
  expect(tag).toBe("svg");
  await expect(glyph).toHaveAttribute("aria-label", "Orbweaver");
  await expect(glyph).toHaveAttribute("role", "img");
  await expect(glyph).toHaveAttribute("width", "48");
  await expect(glyph).toHaveAttribute("height", "48");
});

test("anim toggles the silk-shimmer class; default is static", async ({ mount }) => {
  const still = await mount(<WeaveGlyph />);
  await expect(still).not.toHaveClass(SHIMMER_CLASS);
  await still.unmount();
  const animated = await mount(<WeaveGlyph anim={true} />);
  await expect(animated).toHaveClass(SHIMMER_CLASS);
});

test("a caller className is preserved alongside the anim class", async ({ mount }) => {
  const glyph = await mount(<WeaveGlyph anim={true} className="text-primary" />);
  await expect(glyph).toHaveClass(PRIMARY_CLASS);
  await expect(glyph).toHaveClass(SHIMMER_CLASS);
});
