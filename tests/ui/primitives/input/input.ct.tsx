// CT: the input seal — token skin as computed style, the touch floor, the
// value/onValueChange controlled-capable passthrough, disabled, and Field composability
// (ui-package-design §6.1; ui-primitive-contract R7).

import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";
import type { OutputInfo } from "sharp";
import sharp from "sharp";
import { pixelExtremaContrast } from "../../../support/browser/pixel-contrast.ts";

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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(focus.boxShadow).not.toBe("none");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(focus.boxShadow).not.toBe("none");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
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
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
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

// ── D159 / #1641 / #1361-1: THE FORM-CONTROL EDGE, FROM THE FRAMEBUFFER ────────────────────────────
//
// `--color-input-border` is the token this control's edge wears since the shared `--color-border`
// hairline measured 1.190-1.318:1 around every form control in the app. The vault side of the claim is
// pinned arithmetically in tests/ui/content/theme-scope/palette-contrast.suite.test.ts; this is the other
// half — the QUANTIZED COMPOSITED PIXEL, which is the only thing that can answer for an edge whose
// interior neighbour (`bg-input`) is a 12-16% alpha fill over whatever panel is behind it
// (`alpha-token-needs-composited-contrast-probe`; `contrast-searches-judge-the-quantized-pixel`).
//
// `pixelExtremaContrast` IS THE RIGHT INSTRUMENT FOR A 1px EDGE. An EMPTY input paints only its border,
// its composited fill and — through the `rounded-control` corners — a little of the pane behind it, so the
// box's brightest and darkest pixels are the edge against the FURTHEST of the surfaces it actually abuts.
// Every one of those pairs is a ground the palette-contrast suite floors separately at 3:1, so the extrema
// are the right upper bound on the same claim. A region sample of a 1px strip would be reading
// anti-aliasing; the extrema are not fooled by it, and because this is an UPPER bound a RED is unarguable.
//
// THE POSITIVE CONTROL IS MANDATORY AND IS IN THE SAME MOUNT: a borderless box wearing the same
// `bg-input` fill must come back ~1:1. Without it, "the extrema are 3.3 apart" is arithmetic about a
// screenshot, not evidence that the EDGE is what supplied one of them.
//
// THE ARM MATRIX IS THE ELEVATION ARM MATRIX. `appearance.elevation` (flat|ramp|glow), the frosted glass
// and the `prefers-contrast: more` block all reach PANEL chrome and never write a control edge; what
// `ramp` actually changes is WHICH panel token a surface paints, lifting fills to `--color-surface-raised`
// / `--color-card`. Mounting the control on all three panel fills is therefore the sweep over every
// appearance arm, taken where it can be measured rather than where it is configured.
const D159_SEEDS = ["hearth", "light", "mocha"] as const;
const D159_PANELS = ["bg-background", "bg-card", "bg-surface-raised"] as const;
/** WCAG 1.4.11 for a user-interface component boundary. */
const UI_COMPONENT_FLOOR = 3;
/** Two samples of ONE flat surface differ only by dithering; the borderless control must land near here. */
const FLAT_SURFACE_MAX = 1.15;

/** Nine panes in ONE mount and inside ONE viewport: playwright-ct refuses a second `mount()`, and a
 *  stacked column ran the last panes off-screen, where `pixelExtremaContrast` correctly REFUSES rather
 *  than reporting a number (its #211 posture — the refusal is what caught the layout). */
const d160Panes = (): ReactElement => (
  <>
    {D159_SEEDS.map((theme) => (
      <div className="flex gap-row" key={theme} {...(theme === "hearth" ? {} : { "data-theme": theme })}>
        {D159_PANELS.map((panel) => (
          <div className={`${panel} flex flex-1 flex-col gap-tight p-row`} key={panel}>
            <Input aria-label={`edge ${theme} ${panel}`} />
            {/* The positive control: the control's own fill with NO edge, same box, same pane — and
                SQUARE. A `rounded-control` control was not flat (1.35-1.47:1): its corners let the pane
                through, and the extrema found it. That is the instrument working, and it is the reason
                the assertion below reads "the surfaces inside the box" rather than "the fill". */}
            <div className="h-control-sm w-full bg-input" data-testid={`flat-${theme}-${panel}`} />
          </div>
        ))}
      </div>
    ))}
  </>
);

test("D159: the form-control EDGE clears 1.4.11's 3:1 against its own composited fill, on every seed and every elevation panel", async ({ mount, page }) => {
  await mount(d160Panes());
  const rows: string[] = [];
  const failures: string[] = [];
  for (const theme of D159_SEEDS) {
    for (const panel of D159_PANELS) {
      const edge = await pixelExtremaContrast(page, page.getByLabel(`edge ${theme} ${panel}`));
      // The control is sampled on its INTERIOR. A whole-box clip rounds outward (`ceil` of a fractional
      // box) and picks up a row of the pane behind it, which reads as 1.35-1.43:1 — the probe finding a
      // real second surface, not a flat box. Inset, and the borderless box is exactly 1.000:1.
      const flat = await pixelExtremaContrast(page, page.getByTestId(`flat-${theme}-${panel}`), {
        region: { x0: 0.1, x1: 0.9, y0: 0.25, y1: 0.75 },
      });
      rows.push(`${theme}/${panel}: edge ${edge.ratio.toFixed(3)}:1 (${edge.describe}) · flat control ${flat.ratio.toFixed(3)}:1`);
      if (edge.ratio < UI_COMPONENT_FLOOR) {
        failures.push(`${theme}/${panel} edge ${edge.ratio.toFixed(3)}:1`);
      }
      if (flat.ratio > FLAT_SURFACE_MAX) {
        failures.push(`${theme}/${panel} POSITIVE CONTROL is not flat (${flat.ratio.toFixed(3)}:1) — the probe is reading something else`);
      }
    }
  }
  expect(failures, `D159 framebuffer matrix:\n  ${rows.join("\n  ")}`).toEqual([]);
});

// ── #1871 item 1 — #1868's DEFERRED BEHAVIOURAL PIN: the field type step, BOTH pointer arms ──────────
//
// #1868 shipped `text.field` / `text.field-dense` as POINTER-CONDITIONAL tokens and landed no test: the
// test trees carried unrelated in-flight work at the time. The defect it closes is a platform one — iOS
// Safari ZOOMS THE VIEWPORT IN when a focused control's type is under 16px and never zooms back out, which
// the owner reported as three symptoms (pinch-to-recover, a tab bar below the fold, sideways panning) that
// are one cause.
//
// BOTH ARMS ARE REAL AND BOTH ARE PINNED. A one-armed test proves half of a pointer-conditional token: the
// coarse arm is the platform floor, the fine arm is the design's own step, and a "fix" that floored BOTH
// would pass a coarse-only pin while silently enlarging every desktop form. The fine arm below is what
// makes this pin discriminate.
//
// IT MUST COME FROM THE CT BROWSER. `snap --viewport WxH` reports `pointer: fine` and
// `snap --mobile --viewport WxH` silently DROPS coarse (open as #1668), so a snap measuring "390 coarse" is
// measuring a layout no phone renders. `hasTouch: true` flips `matchMedia("(pointer: coarse)")` in chromium
// (the `touch-target-floor.suite.ct.tsx` precedent), which is what the emitted `@media(pointer:fine)`
// override keys off.
//
// 16 IS A PLATFORM CONSTANT, NOT OUR TOKEN, which is why it is spelled here as a literal with its reason
// while everything else is read off the RESOLVED token: the assertion is both "the platform floor holds"
// and "the token is what delivers it", so a hardcoded `font-size: 16px` bolted onto the seal would satisfy
// the first and fail the second.
const IOS_FOCUS_ZOOM_FLOOR_PX = 16;

/** The px `--text-field` / `--text-field-dense` resolve to IN THIS DOCUMENT, under whatever pointer the
 *  context is emulating — never a number copied out of `tokens.json`, which cannot see the media query. */
async function resolvedTypeStep(page: Page, cssVar: string): Promise<number> {
  return await page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.fontSize = `var(${name})`;
    document.body.append(probe);
    const size = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return size;
  }, cssVar);
}

function fieldArms(): ReactElement {
  return (
    <div style={{ width: 260 }}>
      <Input aria-label="field type step" />
      <Input aria-label="dense type step" layout="inline" />
    </div>
  );
}

test.describe("coarse pointer — the field type step clears iOS's focus-zoom floor (#1871/#1868)", () => {
  test.use({ hasTouch: true });

  test("both field arms paint at or above 16px, and it is the pointer-conditional token that delivers it", async ({ mount, page }) => {
    await mount(fieldArms());
    const read = (name: string): Promise<number> => page.getByLabel(name).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    const [field, dense, fieldToken, denseToken] = await Promise.all([
      read("field type step"),
      read("dense type step"),
      resolvedTypeStep(page, "--text-field"),
      resolvedTypeStep(page, "--text-field-dense"),
    ]);
    expect(field, "a coarse-pointer field under 16px re-arms the iOS focus zoom").toBeGreaterThanOrEqual(IOS_FOCUS_ZOOM_FLOOR_PX);
    expect(dense, "the DENSE arm is floored too — a platform floor is not negotiable by density").toBeGreaterThanOrEqual(IOS_FOCUS_ZOOM_FLOOR_PX);
    expect(field, "the floor must come from --text-field, not from a hardcoded size on the seal").toBeCloseTo(fieldToken, 1);
    expect(dense, "…and the dense arm from --text-field-dense").toBeCloseTo(denseToken, 1);
    // The two arms CONVERGE at a coarse pointer — that convergence is the token's own stated design, and
    // asserting it is what stops a "fix" that floored only the non-dense half.
    expect(dense).toBeCloseTo(field, 1);
  });
});

test.describe("fine pointer — the field type step keeps the design's own steps (#1871/#1868)", () => {
  test.use({ hasTouch: false });

  test("the fine arm is BELOW the platform floor and the two steps diverge — the token is conditional, not floored", async ({ mount, page }) => {
    await mount(fieldArms());
    const read = (name: string): Promise<number> => page.getByLabel(name).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    const [field, dense, fieldToken, denseToken] = await Promise.all([
      read("field type step"),
      read("dense type step"),
      resolvedTypeStep(page, "--text-field"),
      resolvedTypeStep(page, "--text-field-dense"),
    ]);
    expect(field).toBeCloseTo(fieldToken, 1);
    expect(dense).toBeCloseTo(denseToken, 1);
    // THIS is the half that would die under a blanket `max(16px, …)` floor: a mouse user's forms would all
    // grow, and the dense step — which exists so a list pane's search box does not outshout the 13px row
    // titles it filters — would stop being dense at all.
    expect(field, "a fine pointer keeps the design's body step, not the platform floor").toBeLessThan(IOS_FOCUS_ZOOM_FLOOR_PX);
    expect(dense, "the dense step is a step BELOW the field step at a fine pointer").toBeLessThan(field);
  });
});

// ── #1872 — THE FLOOR HOLDS UNDER THE READER'S OWN TYPE SCALE ────────────────────────────────────────
//
// `appearance.fontScale` writes `--font-scale` on `<html>` and ui globals.css spells
// `:root { font-size: calc(100% * var(--font-scale, 1)) }`, so EVERY rem — including the coarse field step
// pinned above — rescales with it. `fontScale` bottoms out at 0.8 (`packages/contracts/src/settings/
// appearance.ts`), which put roughly the lower 40% of the slider's travel back under 16px (0.95 → 15.2,
// 0.90 → 14.4, 0.80 → 12.8) and silently re-armed the iOS focus zoom #1868 exists to prevent. #1868's pin
// above could not see it: a CT runs at scale 1, which is the ONE stop where the defect does not exist.
//
// THE FIX IS `orb.rootFloor` ON THE PAIR, NOT `max(16px, 1rem)` ON THE FACE — #1872 bars the latter, and
// this case is what makes the bar enforceable. Flooring a face alone leaves it inside a line box that KEPT
// shrinking, so at 0.8 the resolved face:leading ratio collapses from the authored 1.5 to 1.0: cramped
// type at exactly the setting a type-sensitive reader is using. Both members of each pair are floored from
// their OWN authored value, so below scale 1 the resolved ratio is the authored one exactly.
//
// THE MATRIX IS BOTH ENDS PLUS THE CROSSOVER, never a point: the floor engages below 1.0, the authored
// value wins above it, and a one-sample pin cannot tell a floor from a constant.
const FONT_SCALE_SWEEP = [0.8, 0.9, 1, 1.25, 1.5] as const;
/** Ratio comparisons are on device-pixel-quantised lengths; a hair of slack keeps the pin off the belt's
 *  own rounding rather than off the defect. */
const RATIO_EPSILON = 0.001;

/** Stamp `--font-scale` on `<html>` exactly as `use-appearance-root-effects` does in the app. */
async function setFontScale(page: Page, scale: number): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.setProperty("--font-scale", String(value));
  }, scale);
}

test.describe("coarse pointer — the iOS floor survives every appearance.fontScale (#1872)", () => {
  test.use({ hasTouch: true });

  test("both field arms hold ≥16px across the whole 0.8-1.5 slider, and each pair keeps its authored face:leading ratio", async ({ mount, page }) => {
    await mount(fieldArms());
    const metrics = (name: string): Promise<{ fontSize: number; lineHeight: number }> =>
      page.getByLabel(name).evaluate((el) => {
        const style = getComputedStyle(el);
        return { fontSize: Number.parseFloat(style.fontSize), lineHeight: Number.parseFloat(style.lineHeight) };
      });

    // The AUTHORED ratio, read off the product at scale 1 rather than copied out of the vault — a
    // deliberate retune of either token moves this pin with it instead of reddening it.
    await setFontScale(page, 1);
    const [baseField, baseDense] = await Promise.all([metrics("field type step"), metrics("dense type step")]);
    const authored = { field: baseField.lineHeight / baseField.fontSize, dense: baseDense.lineHeight / baseDense.fontSize };

    const rows: string[] = [];
    const failures: string[] = [];
    for (const scale of FONT_SCALE_SWEEP) {
      await setFontScale(page, scale);
      const [field, dense] = await Promise.all([metrics("field type step"), metrics("dense type step")]);
      const ratio = { field: field.lineHeight / field.fontSize, dense: dense.lineHeight / dense.fontSize };
      rows.push(
        `fontScale ${scale}: field ${field.fontSize}/${field.lineHeight} (${ratio.field.toFixed(3)}) · dense ${dense.fontSize}/${dense.lineHeight} (${ratio.dense.toFixed(3)})`,
      );
      if (field.fontSize < IOS_FOCUS_ZOOM_FLOOR_PX) {
        failures.push(`fontScale ${scale}: field ${field.fontSize}px re-arms the iOS focus zoom`);
      }
      if (dense.fontSize < IOS_FOCUS_ZOOM_FLOOR_PX) {
        failures.push(`fontScale ${scale}: dense ${dense.fontSize}px re-arms the iOS focus zoom`);
      }
      // `round(up, …)` may only ever ENLARGE a line box, so the resolved ratio is ≥ the authored one at
      // every stop. A face floored WITHOUT its leading drives this below 1 and is caught here.
      if (ratio.field + RATIO_EPSILON < authored.field) {
        failures.push(`fontScale ${scale}: field ratio ${ratio.field.toFixed(3)} fell below the authored ${authored.field.toFixed(3)}`);
      }
      if (ratio.dense + RATIO_EPSILON < authored.dense) {
        failures.push(`fontScale ${scale}: dense ratio ${ratio.dense.toFixed(3)} fell below the authored ${authored.dense.toFixed(3)}`);
      }
    }
    await setFontScale(page, 1);
    expect(failures, `#1872 fontScale matrix (coarse pointer):\n  ${rows.join("\n  ")}`).toEqual([]);
  });
});

test.describe("fine pointer — the root floor does NOT reach the desktop steps (#1872)", () => {
  test.use({ hasTouch: false });

  test("at fontScale 0.8 the fine arms still scale down — the floor is a coarse-pointer platform fact, not a global minimum", async ({ mount, page }) => {
    await mount(fieldArms());
    await setFontScale(page, 0.8);
    const read = (name: string): Promise<number> => page.getByLabel(name).evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    const [field, dense] = await Promise.all([read("field type step"), read("dense type step")]);
    await setFontScale(page, 1);
    // A fine arm that floored would read 16 here and every desktop form would have grown. This is the
    // discriminating half — without it a blanket `max(16px, …)` passes the coarse matrix above.
    expect(field, "the fine field step still tracks --font-scale downward").toBeLessThan(IOS_FOCUS_ZOOM_FLOOR_PX);
    expect(dense, "…and the dense fine step stays a step below it").toBeLessThan(field);
  });
});
