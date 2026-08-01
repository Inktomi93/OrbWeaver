// CT: the slider seal — keyboard steps the value through real ARIA (aria-valuenow), min/max
// clamp holds, and the drag surface meets the 44px touch floor.
import { Field } from "@orb/ui/field";
import { Slider } from "@orb/ui/slider";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color";

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
  expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
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

// The `tone` axis (preset-surface-redesign.md §4.1/§13 — the KnobRow's inherited-vs-explicit grammar).
// Asserted by RESOLVED color, never by class: the ghost arm's whole job is to read as "not yours yet"
// in the browser, and a class assertion would stay green if the token behind it moved.
const INDICATOR = '[data-slot="slider-indicator"]';
const THUMB = '[data-slot="slider-thumb"]';
/** The ghost fill's alpha, as the browser serializes a 30% token mix. Asserting the ALPHA (not just
 *  "different from default") is what makes the check non-vacuous: a dropped/misspelled utility resolves
 *  fully transparent, which would satisfy every not-equal assertion while painting no fill at all. */
const GHOST_FILL_ALPHA = "0.3";

test("tone: default is the ember fill + full-weight thumb; ghost drops both onto the neutral ramp", async ({ mount, page }) => {
  await mount(
    <>
      <Slider defaultValue={50} label="Explicit" />
      <Slider defaultValue={50} label="Inherited" tone="ghost" />
    </>,
  );
  const indicators = page.locator(INDICATOR);
  const thumbs = page.locator(THUMB);
  await expect(indicators).toHaveCount(2);

  // DEFAULT — byte-identical to the pre-axis skin.
  await expect(indicators.nth(0)).toHaveCSS("background-color", resolvedTokenColor("color.primary"));
  await expect(thumbs.nth(0)).toHaveCSS("background-color", resolvedTokenColor("color.foreground"));

  // GHOST — the thumb is the muted ramp (still solid: the datum stays legible), the fill is off the accent
  // AND quieter than the default's own resolved fill.
  await expect(thumbs.nth(1)).toHaveCSS("background-color", resolvedTokenColor("color.muted-foreground"));
  const [defaultFill, ghostFill] = await Promise.all([
    indicators.nth(0).evaluate((el) => getComputedStyle(el).backgroundColor),
    indicators.nth(1).evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
  expect(ghostFill).not.toBe(defaultFill);
  expect(ghostFill).not.toBe(resolvedTokenColor("color.primary"));
  expect(ghostFill).toContain(GHOST_FILL_ALPHA);
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
