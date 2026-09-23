// <RingGauge> CT — the decorative pool orb. Its job: a ring GAUGE
// (arc = value/max, never a bare circled number), the value glyph inside, and the accessible datum as a
// visually-hidden `label value/max` line (the ring itself is aria-hidden). Assert the arc-stroke ramp
// token, the sr-only datum, and the aria-hidden svg — never a hardcoded px/hex.
import { RingGauge } from "@orb/ui/meter";
import { ThemeScope } from "@orb/ui/theme-scope";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { partVsSurface } from "../../../support/browser/part-vs-surface.ts";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";

test("the arc fill strokes the requested track-ramp step and the svg is decorative", async ({ mount }) => {
  const component = await mount(<RingGauge value={12} max={20} color={2} label="Sanity" />);
  const svg = component.locator("[data-slot=ring-gauge-svg]");
  await expect(svg).toHaveAttribute("aria-hidden", "true");
  // The arc stroke reads `currentColor`; the ramp is applied as text-track-N → the element's `color`. The
  // ramp token is polarity-aware `light-dark()` now (#697); the dark-scheme CT paints the resolved dark arm.
  await expect(component.locator("[data-slot=ring-gauge-fill]")).toHaveCSS("color", resolvedTokenColor("color.track-2"));
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

// ── #693: THE EMPTY TRACK, MEASURED ON THE PANEL IT ACTUALLY RIDES ────────────────────────────────
// The same faint-ring idiom #685 fixed on `<Meter kind="arc">`, on the sibling that kept `text-muted`.
// This gauge is a rpg-band pool orb, so its backing is the context PANEL (`--color-sidebar`, or
// `--color-surface-raised` under the ramp elevation) — NOT the card the arc meter sits on, and the numbers
// do not transfer: `muted` measured 1.0150:1 against a light palette's sidebar (vs the arc's 1.14 on card),
// i.e. a ring with no ring on the brightest polarity. Framebuffer-composited through the shared kernel,
// because the token that replaces it carries ALPHA and a bare canvas read would measure it over
// transparent black (`part-vs-surface.ts` states the trap).
const RING_TRACK = '[data-slot="ring-gauge-track"]';
const RING_FILL = '[data-slot="ring-gauge-fill"]';
/** One meaningful step stronger than the ramp neighbour `muted` could ever be — the #685 floor's shape
 *  (that row spells it off the dark arm's 1.1315 ramp step; the same 1.30 number, stated for this panel). */
const TRACK_FLOOR = 1.3;
// The two polarities' real bases, taken from the token sources rather than spelled as literals: the Light
// seed's own generated `--color-background`, and the base `@theme` ramp's (Hearth, the dark seed).
const PANEL_ARMS = [
  { label: "a near-white carried palette", base: SEED_THEME_VALUE_SETS.light.vars["--color-background"] },
  { label: "the dark seed", base: TOKENS["color.background"].value },
] as const;

for (const { label, base } of PANEL_ARMS) {
  test(`#693 the ring gauge's TRACK reads as a graphic on the PANEL under ${label}`, async ({ mount }) => {
    const component = await mount(
      <ThemeScope tokens={{ background: base }}>
        <div data-testid="panel" style={{ backgroundColor: "var(--color-sidebar)" }}>
          <RingGauge value={12} max={20} color={2} label="Sanity" />
        </div>
      </ThemeScope>,
    );
    await expect.poll(() => component.getByTestId("panel").evaluate(partVsSurface, RING_TRACK), { intervals: [20, 50, 100] }).toBeGreaterThan(TRACK_FLOOR);
  });

  test(`#693 the ring gauge's VALUE arc still outshouts its track under ${label}`, async ({ mount }) => {
    // The #685 invariant, carried to the sibling: a stronger empty track is an improvement only while the
    // part carrying the reading stays the loudest. This reds if a later lane raises the track to an ink.
    const component = await mount(
      <ThemeScope tokens={{ background: base }}>
        <div data-testid="panel" style={{ backgroundColor: "var(--color-sidebar)" }}>
          <RingGauge value={12} max={20} color={2} label="Sanity" />
        </div>
      </ThemeScope>,
    );
    const panel = component.getByTestId("panel");
    const track = await panel.evaluate(partVsSurface, RING_TRACK);
    const fill = await panel.evaluate(partVsSurface, RING_FILL);
    expect(fill, `fill ${String(fill)} must stay louder than track ${String(track)}`).toBeGreaterThan(track);
  });
}
