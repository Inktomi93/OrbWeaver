// The shared app-level brand component: labelled/decorative SVG, requested size, and shimmer class.
// The shimmer's CSS lives in the client globals (not the @orb/ui-only CT stylesheet), so this asserts
// the CLASS wiring, not the computed animation — the reduced-motion safety rides the global floor.

import { expect, test } from "@playwright/experimental-ct-react";
import { WeaveGlyph } from "../../../packages/client/src/components/weave-glyph.tsx";

const SHIMMER_CLASS = /orb-weave-shimmer/u;
const PRIMARY_CLASS = /text-primary/u;

test("renders a labelled brand SVG at the requested size", async ({ mount }) => {
  const glyph = await mount(<WeaveGlyph size={48} />);
  await expect(glyph).toHaveJSProperty("tagName", "svg");
  await expect(glyph).toHaveAttribute("aria-label", "Orbweaver");
  await expect(glyph).toHaveAttribute("role", "img");
  await expect(glyph).toHaveAttribute("width", "48");
  await expect(glyph).toHaveAttribute("height", "48");
});

test("decorative drops the glyph out of the a11y tree — for a glyph inside an already-named control", async ({ mount }) => {
  // The rail brand button carries the name ("Home"); a nested role="img" named "Orbweaver" would give one
  // control two competing names.
  const glyph = await mount(<WeaveGlyph decorative={true} />);
  await expect(glyph).toHaveAttribute("aria-hidden", "true");
  await expect(glyph).not.toHaveAttribute("role", "img");
  await expect(glyph).not.toHaveAttribute("aria-label", "Orbweaver");
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
