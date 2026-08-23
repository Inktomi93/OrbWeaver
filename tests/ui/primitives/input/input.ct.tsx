// CT: the input seal — token skin as computed style, the touch floor, the
// value/onValueChange controlled-capable passthrough, disabled, and Field composability
// (ui-package-design §6.1; ui-primitive-contract R7).

import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { OutputInfo } from "sharp";
import sharp from "sharp";

const TOUCH_FLOOR_PX = 44;
const NON_EMPTY = /.+/u;

// The contract is that the ring is IMMEDIATE at FULL motion — the reduced-motion arm below proves nothing
// about it, because the global floor kills every transition there anyway. Asserted as the resolved
// DURATION: `transitionProperty` cannot carry this fence, because with no transition utility on the seal it
// computes to the CSS initial value `all`, and `"all"` fails any "does not contain <property>" check by
// construction — a green that survives re-adding a `transition-colors duration-(--motion-fast)`.
test("full motion: focus is immediate — the seal transitions nothing, so the ring cannot lag the keystroke", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const input = await mount(<Input aria-label="Motion-safe input" />);
  await input.focus();
  const focus = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return { boxShadow: style.boxShadow, transitionDuration: style.transitionDuration };
  });
  expect(focus.boxShadow).not.toBe("none");
  expect(focus.transitionDuration).toBe("0s");
});

test("reduced motion: focus is immediate and the global floor removes transitions", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const input = await mount(<Input aria-label="Motion-safe input" />);
  await input.focus();
  const focus = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return { boxShadow: style.boxShadow, transitionProperty: style.transitionProperty };
  });
  expect(focus.boxShadow).not.toBe("none");
  expect(focus.transitionProperty).toBe("none");
});

test("wears the bg-input token", async ({ mount }) => {
  const input = await mount(<Input />);
  await expect(input).toHaveCSS("background-color", TOKENS["color.input"].value);
});

// The ≥44px floor is a COARSE-pointer guarantee (D62 P1) — the input height narrows on fine pointers,
// so this runs under an emulated coarse pointer (hasTouch → pointer:coarse, the tokens/index.ct.tsx
// precedent). Without it the default Desktop-Chrome CT is fine and the height is 28, not the floor.
test.describe("coarse pointer — the touch floor", () => {
  test.use({ hasTouch: true });

  test("meets the touch floor", async ({ mount }) => {
    const input = await mount(<Input />);
    const box = await input.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  });
});

// `layout="inline"` is the CLICK-TO-EDIT box (tracker values, ambient strip): the revealed input must
// occupy the same slot the display did, so it is text-height with the datum's inset — where the default
// `field` arm is a control. It replaces a call-site `!h-auto min-h-0 !px-field` bang string, so the receipt
// is the PAINTED difference between the two arms, read computed, not the class list.
test("layout=inline is a text-height box with the datum's inset, not the field control", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 240 }}>
      <Input aria-label="field arm" />
      <Input aria-label="inline arm" layout="inline" />
    </div>,
  );
  const read = (name: string): Promise<{ height: number; paddingInline: number; fontSize: number }> =>
    page.getByLabel(name).evaluate((el) => {
      const s = getComputedStyle(el);
      return { height: el.getBoundingClientRect().height, paddingInline: Number.parseFloat(s.paddingLeft), fontSize: Number.parseFloat(s.fontSize) };
    });
  const [field, inline] = await Promise.all([read("field arm"), read("inline arm")]);
  // RELATIONAL (survives a token retune): the inline box is shorter, tighter and typed one step down …
  expect(inline.height).toBeLessThan(field.height);
  expect(inline.paddingInline).toBeLessThan(field.paddingInline);
  expect(inline.fontSize).toBeLessThan(field.fontSize);
  // … and against the resolved token, its inset IS --spacing-field (never a hardcoded px).
  const fieldToken = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-field)";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  expect(inline.paddingInline).toBeCloseTo(fieldToken, 1);
  // It keeps the editable chrome — this is still an input, not a label.
  await expect(page.getByLabel("inline arm")).toHaveCSS("background-color", TOKENS["color.input"].value);
});

// #522 — AN UNSET DATE-FAMILY INPUT WEARS THE PLACEHOLDER TONE.
//
// FRAMEBUFFER, NOT COMPUTED STYLE, AND THAT IS NOT PARANOIA: `getComputedStyle(el,
// "::-webkit-datetime-edit")` silently returns the HOST's colour in chromium — measured 2026-08-22, it read
// `rgb(240,240,240)` for both arms of a stage where the rule was demonstrably applied. A UA pseudo-element
// is PAINT; only pixels see it, the same class as a mask. So this decodes the shot.
//
// The metric is the BRIGHTEST ink pixel in each control, on a dark surface where the dashes are the only
// ink. Relational (it tracks whatever `--color-muted-foreground` resolves to, never a remembered value) and
// two-sided: the filled arm is the positive control — if the decode found no ink at all, its own assertion
// against the field background fails rather than the silence passing for free.
/** The share of the control's width that is DATETIME-EDIT and not the UA's own calendar-picker indicator.
 *  Measured first attempt: the indicator paints pure white (255) in BOTH arms, so a full-control decode read
 *  peak 255 either side and the comparison was structurally incapable of failing. The reading region is the
 *  leading edge, where the segmented value lives. */
const DATETIME_EDIT_SHARE = 0.6;
/** The TRAILING share of the control that is the UA's own `::-webkit-calendar-picker-indicator` (#541b). Kept
 *  well inside the glyph's own box so the sample can only contain indicator and field plate — the segmented
 *  value never reaches this far, so a bright reading here is the icon and nothing else. */
const PICKER_INDICATOR_SHARE = 0.2;

/** Decode one END of a control's painted box. `leading` = the segmented datetime editor; `trailing` = the
 *  UA's calendar-picker indicator. Both are PAINT — `getComputedStyle` on either pseudo lies (see above). */
async function inkStats(page: Page, locator: Locator, region: "leading" | "trailing" = "leading"): Promise<{ peak: number; plate: number }> {
  const box = await locator.boundingBox();
  expect(box, "the control must be laid out before its pixels mean anything").not.toBeNull();
  const boxWidth = box?.width ?? 0;
  const boxX = box?.x ?? 0;
  const width = region === "leading" ? boxWidth * DATETIME_EDIT_SHARE : boxWidth * PICKER_INDICATOR_SHARE;
  const shot = await page.screenshot({
    clip: { height: box?.height ?? 0, width, x: region === "leading" ? boxX : boxX + boxWidth - width, y: box?.y ?? 0 },
  });
  // The intermediate is ANNOTATED, not decoration: biome's type service cannot follow sharp's
  // `export =` CJS types (node_modules/sharp/lib/index.d.ts:1999) so a direct `await sharp(...)
  // .toBuffer(...)` false-positives useAwaitThenable — the annotation hands it the Promise shape tsc
  // already resolves (probe-verified 2026-08-23: the direct arm fires, this arm does not).
  const pending: Promise<{ data: Buffer; info: OutputInfo }> = sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = await pending;
  const histogram = new Map<number, number>();
  let peak = 0;
  for (let index = 0; index + info.channels <= data.length; index += info.channels) {
    // Rec. 709 relative luminance of the sRGB byte triple — good enough to rank two greys apart.
    const luminance = Math.round(0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0));
    peak = Math.max(peak, luminance);
    histogram.set(luminance, (histogram.get(luminance) ?? 0) + 1);
  }
  // The PLATE is the modal luminance: glyphs are a small minority of a control's pixels, so the mode is the
  // field's own background. (The p50 would land ON a glyph inside a dense row — the #508 lesson.)
  let plate = 0;
  let best = -1;
  for (const [luminance, count] of histogram) {
    if (count > best) {
      best = count;
      plate = luminance;
    }
  }
  return { peak, plate };
}

test("an unset month input's UA interior is painted in the placeholder tone, not the foreground", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 240 }}>
      <Input aria-label="month without a value" type="month" value="" onValueChange={(): void => undefined} />
      <Input aria-label="month with a value" type="month" value="2026-06" onValueChange={(): void => undefined} />
    </div>,
  );
  const unset = page.getByLabel("month without a value");
  const set = page.getByLabel("month with a value");
  // The attribute is the seam the stylesheet keys off — assert it BEFORE the pixels, so a decode that comes
  // out equal reports "the tone did not land", not "the primitive stopped stating the fact".
  await expect(unset).toHaveAttribute("data-empty", "");
  await expect(set).not.toHaveAttribute("data-empty", "");

  const [unsetInk, setInk] = await Promise.all([inkStats(page, unset), inkStats(page, set)]);
  // POSITIVE CONTROL, BOTH ARMS: each control must actually carry ink above its own plate, or a decode that
  // found nothing would satisfy the comparison below for free.
  expect(setInk.peak, "the filled month must print ink above its own field plate").toBeGreaterThan(setInk.plate + 20);
  expect(unsetInk.peak, "the unset dashes are still ink, just quieter").toBeGreaterThan(unsetInk.plate + 5);
  expect(unsetInk.peak, "the unset dashes recede below the value they stand in for").toBeLessThan(setInk.peak);
});

// #541b — AND THE PICKER GLYPH JOINS THE MUTED RAMP.
//
// #522 tinted `::-webkit-datetime-edit` and recorded, in its own stylesheet note, that "the native picker and
// its indicator are untouched". The consequence was the finding this pins: `color` cannot reach an IMAGED
// pseudo-element, so the UA's calendar icon kept painting pure white — measured 255 in BOTH arms while the
// dashes it sits beside had just been muted, which made the loudest ink in a filter column the one glyph with
// nothing to say. `opacity` on `::-webkit-calendar-picker-indicator` is the fix (globals.css).
//
// The claim is RELATIONAL and two-sided, never a remembered byte: the indicator must not out-shout the value
// the field is for, and it must still be VISIBLE (a toned glyph that vanished would be a worse defect than a
// loud one). Framebuffer for the same reason as above — a mask/image pseudo is invisible to computed style.
test("the UA calendar-picker glyph is toned toward the muted ramp, and stays visible", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 240 }}>
      <Input aria-label="month without a value" type="month" value="" onValueChange={(): void => undefined} />
      <Input aria-label="month with a value" type="month" value="2026-06" onValueChange={(): void => undefined} />
    </div>,
  );
  const unset = page.getByLabel("month without a value");
  const set = page.getByLabel("month with a value");

  const [unsetGlyph, unsetDashes, setValue] = await Promise.all([
    inkStats(page, unset, "trailing"),
    inkStats(page, unset, "leading"),
    inkStats(page, set, "leading"),
  ]);

  // POSITIVE CONTROL: the glyph is still painted. A decode that found only the field plate would satisfy
  // every ceiling below for free.
  expect(unsetGlyph.peak, "the picker glyph must still print above its own field plate").toBeGreaterThan(unsetGlyph.plate + 20);
  // THE DEFECT, PINNED: it used to read 255 — brighter than the SET value's own ink, and far brighter than
  // the placeholder dashes it shares a box with.
  expect(unsetGlyph.peak, "the picker glyph must not out-shout the value the field is for").toBeLessThan(setValue.peak);
  // …and it lands on the muted ramp the dashes were moved to, rather than somewhere between the two tones.
  expect(unsetGlyph.peak, "the picker glyph belongs on the same muted ramp as the unset dashes").toBeLessThanOrEqual(unsetDashes.peak + 10);
});

test("a text input never claims the date-family empty marker", async ({ mount }) => {
  const input = await mount(<Input aria-label="empty text" value="" onValueChange={(): void => undefined} />);
  await expect(input).not.toHaveAttribute("data-empty", "");
});

test("typing updates the value and fires onValueChange", async ({ mount }) => {
  const seen: string[] = [];
  const input = await mount(
    <Input
      onValueChange={(value): void => {
        seen.push(value);
      }}
    />,
  );
  await input.fill("hearth");
  await expect(input).toHaveValue("hearth");
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe("hearth");
});

test("disabled blocks input and drops the interactive skin", async ({ mount }) => {
  const input = await mount(<Input disabled={true} />);
  await expect(input).toBeDisabled();
  await expect(input).toHaveCSS("opacity", "0.5");
});

test("inside a <Field>, the label associates and aria-describedby wires the description", async ({ mount, page }) => {
  await mount(
    <Field description="Shown to other players" label="Display name">
      <Input />
    </Field>,
  );
  const control = page.getByLabel("Display name");
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});
