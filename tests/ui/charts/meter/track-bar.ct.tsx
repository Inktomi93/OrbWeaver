// <TrackBar> CT — the decorative magnitude bar (Context-Panel-Program §3.2 / §4.9). The bar's whole
// job is: fill WIDTH = value/max, fill COLOR = the D71 track ramp token, and the bar is aria-hidden
// (the datum is TEXT the consuming block renders — never the bar). Assert the computed width fraction,
// the resolved ramp token color, and the aria-hidden contract — never a hardcoded px/hex.
import { TrackBar } from "@orb/ui/meter";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";

test("fill width is value/max and the fill rides the track-ramp token color", async ({ mount }) => {
  const component = await mount(<TrackBar value={24} max={30} color={1} />);
  const fill = component.locator("[data-slot=track-bar-fill]");
  const box = await fill.boundingBox();
  const track = await component.boundingBox();
  // 24/30 = 80% of the track (geometry, not a hardcoded px).
  const fraction = (box?.width ?? 0) / (track?.width ?? 1);
  expect(fraction).toBeGreaterThan(0.78);
  expect(fraction).toBeLessThan(0.82);
  // The ramp token is polarity-aware `light-dark()` now (#697); the CT harness renders the base dark
  // scheme, so the resolved DARK arm is what paints — `resolvedTokenColor` returns it.
  await expect(fill).toHaveCSS("background-color", resolvedTokenColor("color.track-1"));
});

test("color=4 uses the fourth ramp step (categorical, by definition order)", async ({ mount }) => {
  const component = await mount(<TrackBar value={70} max={100} color={4} />);
  await expect(component.locator("[data-slot=track-bar-fill]")).toHaveCSS("background-color", resolvedTokenColor("color.track-4"));
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

// The `width` variant. `swatch` replaces the tracker-definition row's retired `className="!w-block shrink-0"`
// — an `!important` override of the base `w-full` that resolved by stylesheet order (`ui-size-via-variant`).
// PARITY, not authoring: the retired class string is mounted BESIDE the variant (Tailwind scans `tests/`, so
// it really compiles) and both boxes are read back computed. The width is checked against the DOCUMENT-
// resolved `--spacing-block`, never a hardcoded 12px.
test("width=swatch paints the SAME fixed box the retired `!w-block shrink-0` class did, resolved off --spacing-block", async ({ mount, page }) => {
  await mount(
    <div style={{ display: "flex", gap: 4, width: 400 }}>
      <TrackBar value={1} max={1} color={1} className="!w-block shrink-0" />
      <TrackBar value={1} max={1} color={1} width="swatch" />
      <div style={{ flex: 1 }} />
    </div>,
  );
  const bars = page.locator("[data-slot=track-bar]");
  const measured = await bars.evaluateAll((els) => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-block)";
    document.body.append(probe);
    const block = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      block,
      boxes: els.map((el) => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height, flexShrink: getComputedStyle(el).flexShrink };
      }),
    };
  });
  const [old, next] = measured.boxes;
  expect(next?.width).toBeCloseTo(old?.width ?? 0, 1);
  expect(next?.height).toBeCloseTo(old?.height ?? 0, 1);
  // The token is the authority for the number, not a px literal.
  expect(next?.width).toBeCloseTo(measured.block, 1);
  // `shrink-0` rides the ARM now — the swatch keeps its width in a flex row with no call-site class.
  expect(next?.flexShrink).toBe("0");
});

test("width defaults to full — the magnitude bar still spans its column", async ({ mount }) => {
  const component = await mount(
    <div style={{ width: 300 }}>
      <TrackBar value={1} max={2} color={1} />
    </div>,
  );
  const bar = component.locator("[data-slot=track-bar]");
  const box = await bar.boundingBox();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box?.width).toBeCloseTo(300, 0);
});
