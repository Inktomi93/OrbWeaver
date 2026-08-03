// <RingGauge> CT — the decorative pool orb (Context-Panel-Program §4.5 / §4.9). Its job: a ring GAUGE
// (arc = value/max, never a bare circled number), the value glyph inside, and the accessible datum as a
// visually-hidden `label value/max` line (the ring itself is aria-hidden). Assert the arc-stroke ramp
// token, the sr-only datum, and the aria-hidden svg — never a hardcoded px/hex.
import { RingGauge } from "@orb/ui/meter";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

test("the arc fill strokes the requested track-ramp step and the svg is decorative", async ({ mount }) => {
  const component = await mount(<RingGauge value={12} max={20} color={2} label="Sanity" />);
  const svg = component.locator("[data-slot=ring-gauge-svg]");
  await expect(svg).toHaveAttribute("aria-hidden", "true");
  // The arc stroke reads `currentColor`; the ramp is applied as text-track-N → the element's `color`.
  await expect(component.locator("[data-slot=ring-gauge-fill]")).toHaveCSS("color", TOKENS["color.track-2"].value);
});

test("the accessible datum is a visually-hidden `label value/max` line (text is the datum)", async ({ mount }) => {
  const component = await mount(<RingGauge value={12} max={20} color={1} label="Health" />);
  await expect(component.getByText("Health 12/20")).toBeAttached();
});

test("showCaption renders the visible short label + value/max readout", async ({ mount }) => {
  const component = await mount(<RingGauge value={6} max={10} color={1} label="Sanity" captionLabel="SAN" showCaption={true} />);
  await expect(component.locator("[data-slot=ring-gauge-label]")).toHaveText("SAN");
  await expect(component.locator("[data-slot=ring-gauge-readout]")).toHaveText("6/10");
});

test("dangerBelow swaps the arc to the destructive intent (never the sole signal)", async ({ mount }) => {
  const component = await mount(<RingGauge value={2} max={20} color={1} label="Health" dangerBelow={5} />);
  await expect(component.locator("[data-slot=ring-gauge-fill]")).toHaveCSS("color", resolvedTokenColor("color.destructive"));
});
