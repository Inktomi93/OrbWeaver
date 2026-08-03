// <TrackBar> CT — the decorative magnitude bar (Context-Panel-Program §3.2 / §4.9). The bar's whole
// job is: fill WIDTH = value/max, fill COLOR = the D71 track ramp token, and the bar is aria-hidden
// (the datum is TEXT the consuming block renders — never the bar). Assert the computed width fraction,
// the resolved ramp token color, and the aria-hidden contract — never a hardcoded px/hex.
import { TrackBar } from "@orb/ui/meter";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

test("fill width is value/max and the fill rides the track-ramp token color", async ({ mount }) => {
  const component = await mount(<TrackBar value={24} max={30} color={1} />);
  const fill = component.locator("[data-slot=track-bar-fill]");
  const box = await fill.boundingBox();
  const track = await component.boundingBox();
  // 24/30 = 80% of the track (geometry, not a hardcoded px).
  const fraction = (box?.width ?? 0) / (track?.width ?? 1);
  expect(fraction).toBeGreaterThan(0.78);
  expect(fraction).toBeLessThan(0.82);
  await expect(fill).toHaveCSS("background-color", TOKENS["color.track-1"].value);
});

test("color=4 uses the fourth ramp step (categorical, by definition order)", async ({ mount }) => {
  const component = await mount(<TrackBar value={70} max={100} color={4} />);
  await expect(component.locator("[data-slot=track-bar-fill]")).toHaveCSS("background-color", TOKENS["color.track-4"].value);
});

test("the bar is decorative — aria-hidden, carrying no accessible value (text is the datum)", async ({ mount }) => {
  const component = await mount(<TrackBar value={9} max={20} color={1} />);
  await expect(component).toHaveAttribute("aria-hidden", "true");
  await expect(component).not.toHaveAttribute("role", "meter");
});

test("dangerBelow swaps the fill to the destructive intent (never the sole signal)", async ({ mount }) => {
  const component = await mount(<TrackBar value={3} max={30} color={1} dangerBelow={10} />);
  await expect(component.locator("[data-slot=track-bar-fill]")).toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
});
