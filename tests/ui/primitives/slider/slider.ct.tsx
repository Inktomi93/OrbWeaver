// CT: the slider seal — keyboard steps the value through real ARIA (aria-valuenow), min/max
// clamp holds, and the drag surface meets the 44px touch floor.
import { Field } from "@orb/ui/field";
import { Slider } from "@orb/ui/slider";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";

const TOUCH_FLOOR_PX = 44;
const NON_EMPTY = /.+/u;

test("ArrowRight steps the value up; clamps at max", async ({ mount, page }) => {
  await mount(<Slider defaultValue={99} label="Volume" max={100} min={0} />);
  const thumb = page.getByRole("slider");
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "100");
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "100");
});

test("respects step and reports through onValueChange", async ({ mount, page }) => {
  const seen: number[] = [];
  await mount(
    <Slider
      defaultValue={50}
      label="Temperature"
      max={100}
      min={0}
      onValueChange={(value): void => {
        seen.push(value);
      }}
      step={5}
    />,
  );
  const thumb = page.getByRole("slider");
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "55");
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe(55);
});

test("the interactive surface meets the touch floor", async ({ mount }) => {
  const slider = await mount(<Slider defaultValue={50} label="Volume" />);
  const box = await slider.boundingBox();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
});

// The thumb is a 24px knob; the track is a 6px rail with `overflow: hidden` (the rail's rounded caps
// clip the Indicator's square fill). Nesting the thumb INSIDE that track clipped it to a 6px sliver —
// a flat white rectangle instead of a knob, and a hit area 6px tall (design-audit `clipped-overflow`
// ×8 on the appearance pane, issue #86 lead 2). Asserted through the COMPOSITOR (`elementFromPoint`),
// not the box: the border box stayed a full 24×24 the whole time it was rendering as a sliver.
test("the thumb paints and hit-tests over its whole box — the track never clips it", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label="Volume" />);
  const thumbEl = page.locator(THUMB);
  const box = await thumbEl.boundingBox();
  await expect
    .poll(
      async () =>
        await thumbEl.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const owns = (y: number): boolean => {
            const hit = document.elementFromPoint(cx, y);
            return hit !== null && (hit === el || el.contains(hit));
          };
          let up = 0;
          let down = 0;
          while (up < rect.height && owns(cy - up - 1)) {
            up += 1;
          }
          while (down < rect.height && owns(cy + down + 1)) {
            down += 1;
          }
          return up + down + 1;
        }),
    )
    .toBeGreaterThanOrEqual(Math.round(box?.height ?? 0) - 1);
});

test("showValue renders the formatted readout", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label="Volume" showValue={true} />);
  await expect(page.locator("output")).toHaveText("50");
});

test("range: two thumbs report [lo, hi] and both are keyboard-operable", async ({ mount, page }) => {
  const seen: number[][] = [];
  await mount(
    <Slider
      defaultValue={[20, 80]}
      label="Bounds"
      max={100}
      min={0}
      onValueChange={(value): void => {
        seen.push(value);
      }}
      showValue={true}
      thumbLabels={["Minimum", "Maximum"]}
    />,
  );
  const lo = page.getByRole("slider", { name: "Minimum" });
  const hi = page.getByRole("slider", { name: "Maximum" });
  await expect(page.getByRole("slider")).toHaveCount(2);
  await expect(lo).toHaveAttribute("aria-valuenow", "20");
  await expect(hi).toHaveAttribute("aria-valuenow", "80");
  // The Value readout formats both ends (Base UI joins with an en dash).
  await expect(page.locator("output")).toContainText("20");
  await expect(page.locator("output")).toContainText("80");

  await lo.press("ArrowRight");
  await expect(lo).toHaveAttribute("aria-valuenow", "21");
  await hi.press("ArrowLeft");
  await expect(hi).toHaveAttribute("aria-valuenow", "79");
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toEqual([21, 79]);
});

test("Home/End/PageUp/PageDown jump to bounds and by the large step", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label="Volume" max={100} min={0} />);
  const thumb = page.getByRole("slider");
  await thumb.press("PageUp");
  await expect(thumb).toHaveAttribute("aria-valuenow", "60");
  await thumb.press("PageDown");
  await thumb.press("PageDown");
  await expect(thumb).toHaveAttribute("aria-valuenow", "40");
  await thumb.press("End");
  await expect(thumb).toHaveAttribute("aria-valuenow", "100");
  await thumb.press("Home");
  await expect(thumb).toHaveAttribute("aria-valuenow", "0");
});

test("disabled blocks stepping and drops the interactive skin", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} disabled={true} label="Volume" />);
  // Slider.Thumb renders an outer styled <div> (our data-slot + skin) wrapping a visually-hidden
  // native <input type="range"> — role="slider" resolves to THAT inner input (the real interactive
  // node), so state/skin assertions target the outer div by data-slot instead.
  const thumbEl = page.locator('[data-slot="slider-thumb"]');
  await expect(thumbEl).toHaveAttribute("data-disabled", "");
  const thumb = page.getByRole("slider");
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "50");
});

test("inside an invalid <Field>, data-invalid lands and the track swaps to the destructive token", async ({ mount, page }) => {
  await mount(
    <Field error="Out of range" label="Volume">
      <Slider defaultValue={50} />
    </Field>,
  );
  const thumbEl = page.locator('[data-slot="slider-thumb"]');
  await expect(thumbEl).toHaveAttribute("data-invalid", "");
  await expect(thumbEl).toHaveCSS("border-top-color", resolvedTokenColor("color.destructive"));
});

test("inside a <Field>, the slider associates and aria-describedby wires the description", async ({ mount, page }) => {
  await mount(
    <Field description="0 to 100" label="Volume">
      <Slider defaultValue={50} />
    </Field>,
  );
  const thumb = page.getByRole("slider");
  await expect(thumb).toHaveAttribute("aria-describedby", NON_EMPTY);
  await expect(thumb).toHaveAccessibleName("Volume");
});

// WCAG 2.4.7: a bare slider (no Field.Root wrapper) must still show a visible focus ring on
// keyboard focus. Base UI's `data-focused` on the Thumb is a no-op outside Field.Root, so the ring
// is keyed off the nested native input's own `:focus-visible` via FOCUS_RING_HAS (`:has()`).
test("a bare slider (no Field wrapper) shows a visible ring on keyboard focus", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label="Volume" />);
  const thumbEl = page.locator('[data-slot="slider-thumb"]');
  await expect(thumbEl).toHaveCSS("box-shadow", "none");

  await page.getByRole("slider").focus();
  await expect(thumbEl).not.toHaveCSS("box-shadow", "none");
});

// The `tone` axis (the KnobRow's inherited-vs-explicit grammar).
// Asserted by RESOLVED color, never by class: the ghost arm's whole job is to read as "not yours yet"
// in the browser, and a class assertion would stay green if the token behind it moved.
const INDICATOR = '[data-slot="slider-indicator"]';
const THUMB = '[data-slot="slider-thumb"]';
/** The resolved ALPHA of an element's background — the GHOST arm's fill is asserted as "paints nothing"
 *  rather than "differs from default", because a merely-DIMMED fill still draws a bar: an unset knob at
 *  its model default then rendered a full grey meter that read as MORE set than the explicit rows beside
 *  it (side-eye F-09). Read as a number so no color literal is spelled here (§13.7 clause 5). */
function backgroundAlpha(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    // A 3-part functional color is opaque; a 4-part one carries its alpha last. Split rather than pattern-
    // match so the assertion names no color syntax at all (§13.7 clause 5 reads the source text).
    const parts = getComputedStyle(el).backgroundColor.split(",");
    return parts.length < 4 ? 1 : Number.parseFloat(parts[3] ?? "1");
  });
}

test("tone: default keeps the ember fill; neutral drops the accent for WEIGHT; ghost paints NO fill at all", async ({ mount, page }) => {
  await mount(
    <>
      <Slider defaultValue={50} label="Standalone" />
      <Slider defaultValue={50} label="Explicit" tone="neutral" />
      <Slider defaultValue={50} label="Inherited" tone="ghost" />
    </>,
  );
  const indicators = page.locator(INDICATOR);
  const thumbs = page.locator(THUMB);
  await expect(indicators).toHaveCount(3);

  // DEFAULT — the standalone slider's skin, unchanged: the ONE sanctioned accent control on a surface
  // that shows a single slider.
  await expect(indicators.nth(0)).toHaveCSS("background-color", resolvedTokenColor("color.primary"));
  await expect(thumbs.nth(0)).toHaveCSS("background-color", resolvedTokenColor("color.foreground"));

  // NEUTRAL (the KnobRow's EXPLICIT arm) — a real fill, but OFF the accent: weight, not ember (§4.1's
  // CD3 ration). The thumb stays full-weight foreground.
  await expect(thumbs.nth(1)).toHaveCSS("background-color", resolvedTokenColor("color.foreground"));
  await expect.poll(async () => await indicators.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(resolvedTokenColor("color.primary"));
  expect(await backgroundAlpha(indicators.nth(1))).toBeGreaterThan(0);

  // GHOST (the INHERITED arm) — a HOLLOW thumb sitting at the effective value over a BARE rail. No fill
  // means no magnitude claim about a number you did not set.
  expect(await backgroundAlpha(thumbs.nth(2))).toBe(0);
  await expect(thumbs.nth(2)).toHaveCSS("border-top-color", resolvedTokenColor("color.muted-foreground"));
  expect(await backgroundAlpha(indicators.nth(2))).toBe(0);
});

// P2-3 (side-eye 2026-08-22): the inherited arm was distinguished from an explicit one by TINT alone, and
// the tint dies in the state that matters. An EXPLICIT knob at its minimum draws a zero-width fill, so at
// the left rail an unset knob and a true-minimum one were two 24px discs differing only in grey — and on a
// brand-new preset all eight sampling thumbs sit exactly there, reading "everything is turned all the way
// down" when the truth is "nothing is set". Pinned as a FILLEDNESS difference (a ring vs a disc), not as a
// colour pair: a tint that merely differs is what this finding says is not enough.
test("P2-3: an UNSET knob and a knob at its TRUE MINIMUM are visibly different at the same rail position", async ({ mount, page }) => {
  await mount(
    <>
      <Slider label="At minimum" max={100} min={0} tone="default" value={0} />
      <Slider label="Unset" max={100} min={0} tone="ghost" value={0} />
    </>,
  );
  const thumbs = page.locator(THUMB);
  const [minimumBox, unsetBox] = await Promise.all([thumbs.nth(0).boundingBox(), thumbs.nth(1).boundingBox()]);
  // SAME POSITION — this is the whole premise of the finding; if they parked apart there would be nothing
  // for the paint to disambiguate.
  expect(unsetBox?.x).toBe(minimumBox?.x);
  // …and the paint carries the distinction on its own: one thumb is filled, the other is a ring.
  expect(await backgroundAlpha(thumbs.nth(0))).toBeGreaterThan(0);
  expect(await backgroundAlpha(thumbs.nth(1))).toBe(0);
});

// P2-8 (side-eye 2026-08-22): Base UI centres a thumb ON its value position, so at `min` and `max` the knob
// hangs half its width outside the CONTROL — and while the control ran the full row, that half landed
// outside the ROW as well. Measured at a 430px coarse viewport: the max thumb ran 406→430 and the min thumb
// 0→24, flush with the screen edge, the grabbable half sitting on the OS edge-swipe bezel.
//
// The reference box is the slider ROOT, not the Control: the overhang past the control is INHERENT to
// centring a thumb on its position and no inset removes it — what the inset buys is that the overhang now
// falls inside the row the slider occupies instead of past it. Asserted as a box relationship rather than a
// viewport number so the pin holds at any mount width.
test("P2-8: at min and at max the thumb stays inside the slider's own row", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 320 }}>
      <Slider label="Floor" max={100} min={0} value={0} />
      <Slider label="Ceiling" max={100} min={0} value={100} />
    </div>,
  );
  const roots = page.locator('[data-slot="slider-root"]');
  const thumbs = page.locator(THUMB);
  const [floorRoot, ceilingRoot, floorThumb, ceilingThumb] = await Promise.all([
    roots.nth(0).boundingBox(),
    roots.nth(1).boundingBox(),
    thumbs.nth(0).boundingBox(),
    thumbs.nth(1).boundingBox(),
  ]);
  expect(floorThumb?.x).toBeGreaterThanOrEqual(floorRoot?.x ?? 0);
  expect((ceilingThumb?.x ?? 0) + (ceilingThumb?.width ?? 0)).toBeLessThanOrEqual((ceilingRoot?.x ?? 0) + (ceilingRoot?.width ?? 0));
});

// `tone` is COLOR ONLY — a seven-row knob deck mixes both arms in one column, so a tone that moved the box
// would make the rows jitter as values are promoted from inherited to explicit.
test("tone leaves the box alone: ghost and default measure identically", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 300 }}>
      <Slider defaultValue={50} label="Explicit" />
      <Slider defaultValue={50} label="Inherited" tone="ghost" />
    </div>,
  );
  const controls = page.locator('[data-slot="slider-control"]');
  const thumbs = page.locator(THUMB);
  const [defaultControl, ghostControl, defaultThumb, ghostThumb] = await Promise.all([
    controls.nth(0).boundingBox(),
    controls.nth(1).boundingBox(),
    thumbs.nth(0).boundingBox(),
    thumbs.nth(1).boundingBox(),
  ]);
  expect(ghostControl?.height).toBe(defaultControl?.height);
  expect(ghostControl?.width).toBe(defaultControl?.width);
  expect(ghostThumb?.height).toBe(defaultThumb?.height);
  expect(ghostThumb?.width).toBe(defaultThumb?.width);
});

test("a ghost slider is still fully operable — the inherited value is editable, not disabled", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label="Top-P" max={100} min={0} tone="ghost" />);
  const thumb = page.getByRole("slider");
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "51");
});

// #1019 — ONE NAMING PATH. Base UI wires the thumb's `aria-labelledby` to the rendered `Slider.Label`
// and DROPS that association the moment any `aria-label` is passed (`SliderThumb.js`:
// `'aria-labelledby': ariaLabelledByProp ?? (ariaLabel == null ? labelId : undefined)`). The seal used to
// seed the thumb's `aria-label` from `thumbLabels[0]` whenever `label` was not a plain string, so a
// slider with a rich visible label announced the OTHER string — the pixels and the name were two
// independent sources that could drift (§13.10 N1: visible text beats `aria-label`).
test("N1: a visible label names the thumb even when thumbLabels is also supplied", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label={<span>Reveal speed</span>} max={100} min={0} thumbLabels={["Chars per second"]} />);
  await expect(page.getByRole("slider")).toHaveAccessibleName("Reveal speed");
});

// The FENCE for the plain-string label: the name is the label the eye reads, sourced from the rendered
// element rather than re-spelled here — a duplicated string would keep passing after the two drifted.
test("N1: the thumb's name IS the rendered label's text", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label="Volume" max={100} min={0} />);
  const labelText = await page.locator('[data-slot="slider-label"]').innerText();
  await expect(page.getByRole("slider")).toHaveAccessibleName(labelText);
});

// The label-less arm (the KnobRow / talkativeness shape): no visible label is rendered, so the string
// form is the ONLY name source and must survive.
test("a label-less slider is still named by thumbLabels", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} max={100} min={0} thumbLabels={["Max output tokens"]} />);
  await expect(page.locator('[data-slot="slider-label"]')).toHaveCount(0);
  await expect(page.getByRole("slider")).toHaveAccessibleName("Max output tokens");
});

// ── #1187: THE KNOB SPENDS NO RESTING TRANSFORM ───────────────────────────────────────────────────
// design-audit filed `off-grid-transform` P3 on `[data-slot=slider-thumb]`: Base UI centres each thumb with
// an INLINE `translate: -50% -50%`, a transform that is live at REST (integer-line-boxes.md §9 Law 2). The
// fix moves the same half-a-thumb onto margins — the box does not move, but a laid-out edge is snapped by
// the paint where a transformed raster is resampled at whatever fraction it resolves to.
//
// THE DPR ARITHMETIC IS THE AUDIT'S OWN. The walker computes `gridDeviceFrac(rect.left)` = the fractional
// part of `rect * dpr` (ui-audit ops/walker/census-grid.ts) and judges it at the live DPR. A CT context has
// ONE deviceScaleFactor, so the three DPRs are evaluated the same way the rule would — from the measured
// CSS-pixel rect — rather than by re-launching a browser per DPR.
//
// MEASURED RELATIVE TO THE CONTROL, deliberately: the thumb's ABSOLUTE landing also carries the vendor's
// percentage inset resolved against the control's own (possibly fractional) width and the page's own
// placement, neither of which this seal owns. What it owns is the CENTERING, and after this change the
// centering contributes an exact integer at every DPR instead of a transform.
const DEVICE_PIXEL_RATIOS = [1, 2, 3] as const;
const GRID_EPSILON_DEVICE_PX = 0.001;

test("#1187: the thumb carries NO transform at rest, and its centering lands on the device grid at DPR 1/2/3", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 320 }}>
      <Slider label="Floor" max={100} min={0} value={0} />
      <Slider label="Middle" max={100} min={0} value={50} />
      <Slider label="Ceiling" max={100} min={0} value={100} />
    </div>,
  );
  const thumbs = page.locator(THUMB);
  const controls = page.locator('[data-slot="slider-control"]');
  await expect(thumbs).toHaveCount(3);

  for (let index = 0; index < 3; index += 1) {
    const thumb = thumbs.nth(index);
    // The rule's subject: an element carrying a non-identity transform AT REST. With `translate: none` and
    // no `transform`, the thumb is not a candidate at all — which is what "express rest geometry as layout"
    // means, not a narrower threshold.
    await expect(thumb).toHaveCSS("translate", "none");
    await expect(thumb).toHaveCSS("transform", "none");

    const offsets = await thumb.evaluate((element) => {
      const control = element.closest('[data-slot="slider-control"]');
      if (control === null) {
        throw new Error("slider-thumb grid pin: the thumb must be a child of the slider control");
      }
      const box = element.getBoundingClientRect();
      const host = control.getBoundingClientRect();
      return { left: box.left - host.left, top: box.top - host.top, height: box.height, width: box.width };
    });
    for (const dpr of DEVICE_PIXEL_RATIOS) {
      const leftFraction = Math.abs(offsets.left * dpr - Math.round(offsets.left * dpr));
      const topFraction = Math.abs(offsets.top * dpr - Math.round(offsets.top * dpr));
      expect(topFraction, `slider ${String(index)}: thumb top offset ${String(offsets.top)} at DPR ${String(dpr)}`).toBeLessThan(GRID_EPSILON_DEVICE_PX);
      expect(leftFraction, `slider ${String(index)}: thumb left offset ${String(offsets.left)} at DPR ${String(dpr)}`).toBeLessThan(GRID_EPSILON_DEVICE_PX);
    }
    // THE GEOMETRY IS UNCHANGED — the margin spends exactly the half-thumb the translate used to. Without
    // this clause, deleting the centering entirely would satisfy every assertion above.
    const host = await controls.nth(index).boundingBox();
    const box = await thumb.boundingBox();
    const centre = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const position = (host?.x ?? 0) + ((host?.width ?? 0) * index) / 2;
    expect(Math.abs(centre - position), `slider ${String(index)}: thumb centre ${String(centre)} vs value position ${String(position)}`).toBeLessThan(0.5);
    expect((box?.y ?? 0) + (box?.height ?? 0) / 2 - ((host?.y ?? 0) + (host?.height ?? 0) / 2)).toBeCloseTo(0, 5);
  }
});
