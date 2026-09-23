// CT: the switch seal — real role="switch" semantics: pointer + keyboard toggle aria-checked,
// checked state lands as the primary token track. (Base UI renders the styled span + a hidden
// form input as siblings, so the role locator is the element under test, not the mount handle.)
import { contrastRatio } from "@orb/tooling/_shared/wcag";
import { Field } from "@orb/ui/field";
import { Switch } from "@orb/ui/switch";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";
import type { PixelSurfaceReceipt, PixelSurfaceRegion } from "../../../support/browser/pixel-contrast.ts";
import { pixelSurface } from "../../../support/browser/pixel-contrast.ts";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";

const NON_EMPTY = /.+/u;

interface SwitchGeometry {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly border: number;
  readonly rootWidth: number;
  readonly rootHeight: number;
  readonly thumbHeight: number;
}

/**
 * The thumb's gap to each rim of the ROOT's border box, the root's own rendered border width — the #424
 * measurement — and the two boxes themselves, which is what #1109's proportional knob is stated in. Read
 * in ONE evaluate so every number comes from the same layout, and returned as rounded px because the
 * defects these express (a whole-border overhang, a flush slab, a travel off by the border) are whole-px.
 */
async function thumbRims(control: Locator): Promise<SwitchGeometry> {
  return await control.evaluate((el) => {
    const knob = el.querySelector('[data-slot="switch-thumb"]');
    if (knob === null) {
      throw new Error("no switch-thumb inside the switch root");
    }
    const root = el.getBoundingClientRect();
    const rect = knob.getBoundingClientRect();
    return {
      left: Math.round(rect.left - root.left),
      right: Math.round(root.right - rect.right),
      top: Math.round(rect.top - root.top),
      bottom: Math.round(root.bottom - rect.bottom),
      border: Math.round(Number.parseFloat(getComputedStyle(el).borderRightWidth)),
      rootWidth: Math.round(root.width),
      rootHeight: Math.round(root.height),
      thumbHeight: Math.round(rect.height),
    };
  });
}

// ── #1109: THE THUMB IS PROPORTIONAL, NOT THE TRACK HEIGHT WEARING A SECOND HAT (owner ruling
// 2026-09-02, "~55% of track height with visible travel"). `--spacing-switch-thumb` used to be ONE
// token doing two jobs — the fine-pointer TRACK HEIGHT and the thumb size at EVERY pointer — so the
// knob could not scale with the pointer: at a fine pointer it was 100% of the track height (flush with
// the root's outer box, top and bottom), and at a coarse one 32px sat in a 64x44 field. #1109 splits
// the height out to `--spacing-switch-track-height` and makes the thumb its own pointer-conditional
// pair. Stated as RATIOS and RELATIONS against the RENDERED boxes, never against the token values: a
// pin that reads the new token would be green on any tree that merely declares it.
const MIN_THUMB_SHARE = 0.45;
const MAX_THUMB_SHARE = 0.65;

/** Every gap the knob leaves is the SAME gap — the geometry that makes a knob read as a knob in a track
 *  rather than a slab in a slot, and (the #1170 half) the reason the band a fill probe measures the
 *  thumb against is the TRACK on all four sides instead of the page above and below it. */
/** How long two agreeing rect reads must be apart to mean "stopped": longer than the thumb's own 130ms
 *  transform transition. */
const SETTLE_INTERVAL_MS = 200;

/**
 * The thumb's geometry once it has SETTLED, without assuming where it parks.
 *
 * A barrier is not an assertion. The predicate this replaced was `the parked gap === the root's border`
 * — true of the pre-#1109 geometry and false of this one, so every pin that merely NEEDED a settled
 * thumb went red at the barrier instead of at its own claim, and a red-first receipt that never reaches
 * its assertion proves nothing. Two rect reads that agree across a window longer than the transition are
 * a settle in EITHER geometry.
 */
async function settledThumb(control: Locator): Promise<SwitchGeometry> {
  let previous = Number.NaN;
  await expect
    .poll(
      async () => {
        const now = (await thumbRims(control)).left;
        const stable = now === previous;
        previous = now;
        return stable;
      },
      { intervals: [SETTLE_INTERVAL_MS, SETTLE_INTERVAL_MS, SETTLE_INTERVAL_MS, SETTLE_INTERVAL_MS] },
    )
    .toBe(true);
  return await thumbRims(control);
}

function expectEqualInset(geometry: SwitchGeometry, when: string): void {
  expect(geometry.border, `[${when}] the root must actually paint a border, or the rim relations are vacuous`).toBeGreaterThan(0);
  expect(geometry.top, `[${when}] the thumb is inset from the root's TOP rim, not flush with it (#1109)`).toBeGreaterThan(geometry.border);
  expect(geometry.bottom, `[${when}] top and bottom insets match — the knob is centred in the track`).toBe(geometry.top);
  expect(geometry.left, `[${when}] the parked knob's END gap equals its top gap — one inset on all four sides`).toBe(geometry.top);
}

test("click toggles aria-checked", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("keyboard toggles too, and checked wears the primary token", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" defaultChecked={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "false");
});

// ── Defect #3 pins (owner: "toggles are very short and tiny and can barely show a difference between
// on and off"). Two regressions locked out: (1) the checked and unchecked tracks must wear DIFFERENT
// token values (not "barely a difference"); (2) the visible track must be a generous rectangle with a
// SUBSTANTIAL thumb travel (the old design collapsed to ~4px travel on fine pointers). done ≠ rendered
// — these assert the RENDERED geometry/colour, not the source. ──
test("checked vs unchecked wear DIFFERENT track token values (the on/off distinction pin)", async ({ mount, page }) => {
  // The two states must map to genuinely different tokens — the "barely shows a difference" regression.
  expect(TOKENS["color.input"].value).not.toBe(TOKENS["color.primary"].value);
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  const off = await control.evaluate((el) => getComputedStyle(el).backgroundColor);
  await control.click();
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await expect.poll(async () => await control.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(off); // rendered colours actually diverge on/off, not just the source classes
});

test("the track is a generous rectangle and the thumb travels a substantial distance", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  const thumb = control.locator('[data-slot="switch-thumb"]');
  const track = await control.boundingBox();
  const offX = (await thumb.boundingBox())?.x ?? 0;
  // Rectangular, not the old near-square (48×32 → w > 1.4×h); the switch reads as a switch at a glance.
  expect((track?.width ?? 0) / (track?.height ?? 1)).toBeGreaterThan(1.4);
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  // Travel = trackWidth − trackHeight = 48 − 32 = 16px at a fine pointer (#1109: with the knob inset
  // equally on all four sides, the border and the inset cancel out of `trackW − 2b − 2·inset − thumb`
  // and the travel is exactly the difference of the two track dimensions — see the dedicated relation
  // pin below). The old fine travel was ~4px; assert well past that so a regression toward a near-square
  // track fails here. Poll past the 130ms transform transition (the thumb slides, boundingBox tracks the
  // transform mid-animation).
  await expect.poll(async () => (await thumb.boundingBox())?.x ?? 0, { intervals: [20, 50, 100] }).toBeGreaterThan(offX + 12);
});

// ── #424: THE THUMB LIVES INSIDE THE BORDER. The root is `border-box` with a border, so its CONTENT
// box is 2×border narrower than `--spacing-switch-track` — a travel of `track − thumb` spends the full
// token and pushes the checked knob one border-width PAST the right rim (measured −1 at both pointers
// before the fix; side-eye #420 P3). Asserted as a RELATION against the root's own rendered
// border-width, so a border-width retune moves the expectation with the design instead of pinning 1.
// #1109 SUPERSEDES THE RESIDUAL THIS CASE USED TO PIN, AND THE MECHANISM SURVIVES ITS CHANGED INPUT.
// Until 2026-09-02 this case asserted `top === 0 && bottom === 0` — the thumb flush with the root's
// OUTER box — and said so honestly: "inset-ing it would mean shrinking the display thumb, a size
// decision this fix has no mandate for". The owner gave that mandate (#1109). #424's own ruling is
// UNCHANGED: the root is border-box, so the thumb's travel must not spend the border. It is now
// satisfied through the inset rather than through a bare `− 2×border` term, because the padding that
// creates the inset absorbs it — `trackW − 2b − 2·inset − thumb` with `inset = (trackH − 2b − thumb)/2`
// reduces to `trackW − trackH`, a relation with no free border in it. Both halves are asserted below
// against the RENDERED boxes, so neither can be satisfied by a token that merely exists.
test("the thumb is a PROPORTIONAL knob, inset equally on all four sides, at both ends of its travel (#1109 / #424)", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  const parked = await thumbRims(control);
  const share = parked.thumbHeight / parked.rootHeight;
  expect(
    share,
    `the knob is ~55% of the track height, not the track height itself (thumb ${String(parked.thumbHeight)} in root ${String(parked.rootHeight)})`,
  ).toBeGreaterThanOrEqual(MIN_THUMB_SHARE);
  expect(
    share,
    `the knob is ~55% of the track height, not a dot in a field (thumb ${String(parked.thumbHeight)} in root ${String(parked.rootHeight)})`,
  ).toBeLessThanOrEqual(MAX_THUMB_SHARE);
  expectEqualInset(parked, "fine · unchecked");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  // SETTLED, not mid-transition: the thumb has a 130ms transform transition (the same false negative
  // the side-eye retracted on this control), so poll the rim rather than reading it same-tick.
  await expect.poll(async () => (await thumbRims(control)).right, { intervals: [20, 50, 100, 150] }).toBe(parked.top);
  // The travel relation itself, measured end-to-end: an equally-inset knob crosses exactly the
  // difference of the track's two dimensions. Red on the pre-#1109 source, which travelled 14 (= 48 − 32
  // − 2×border) against the 16 this asserts.
  const travelled = await thumbRims(control);
  expect(travelled.left - parked.left, "travel = trackWidth − trackHeight").toBe(parked.rootWidth - parked.rootHeight);
});

// ── #1143 / #1640: THE THUMB LANDS ON THE DEVICE-PIXEL GRID AT A FRACTIONAL ROOT.
//
// The founding measurement: at `--font-scale 0.875` the root is 14px, so the fine `--spacing-switch-thumb`
// (1.125rem) resolved 15.75px inside a 28px track, and `items-center` HALVED the leftover into a 5.125px
// block offset — a fraction the browser resamples at every DPR. Since #1640 the whole `--spacing-*` family
// carries `orb.output: snapped`, so both the base arm AND the `@media (pointer: fine)` override (the arm
// this control actually renders under, and the one the belt originally missed) emit `round(up, …, 1px)`.
//
// STATED AS INTEGERS, NOT AS TOKEN LITERALS: an integer CSS px is on the device grid at EVERY integer DPR,
// which is the whole claim — this file cannot set `deviceScaleFactor` (a browser-context option), and an
// integer landing makes the DPR arm unnecessary rather than unmeasured.
//
// THE RESIDUAL THIS BLOCK USED TO DECLARE IS GONE — #1684 (owner ruling 2026-09-06). It read: the belt
// makes each LENGTH integer, never the DIFFERENCE between two of them even, so when (content − thumb) is
// ODD `items-center` centres on a half pixel; `1.25` was such a cell and this file asserted the half pixel
// "as the honest limit, not a wobble to be widened". That was true of a DECLARED thumb — and 1.25 is the
// `reading` appearance preset, i.e. a shipping user state, where design-audit's `off-grid-transform` duly
// filed the resting knob at half a device pixel (#1684). The knob is now DERIVED from the other three
// dimensions (`track-height − 2×border − 2×inset`, variants.ts), so the centred difference is `2×inset` —
// even by construction — and the rest landing is exactly `border + inset` at EVERY scale. 1.25 therefore
// joins the whole-pixel table rather than sitting under it as a declared limit.
//
// blockOffset is measured from the root's BORDER-BOX top, so it is the 1px `--border-width-control` plus
// the centred gap inside the content box, which is now the belted inset itself: scale 1 → 1 + 6 = 7 ·
// 0.875 → 1 + ceil(5.25) = 7 · 1.15 → 1 + ceil(6.9) = 8 · 1.25 → 1 + ceil(7.5) = 9. Every one a whole
// pixel because the knob is what the belted inset LEAVES, not a fourth independently belted length.
const FRACTIONAL_ROOT_SCALES = [
  { scale: 1, blockOffsetPx: 7 },
  { scale: 0.875, blockOffsetPx: 7 },
  { scale: 1.15, blockOffsetPx: 8 },
  { scale: 1.25, blockOffsetPx: 9 },
] as const;

async function switchBoxes(control: Locator): Promise<{ readonly track: number; readonly thumb: number; readonly blockOffset: number }> {
  return await control.evaluate((el) => {
    const knob = el.querySelector('[data-slot="switch-thumb"]');
    if (knob === null) {
      throw new Error("no switch-thumb inside the switch root");
    }
    const root = el.getBoundingClientRect();
    const rect = knob.getBoundingClientRect();
    // UNROUNDED on purpose — the defect IS the fraction, so rounding here would assert the bug away.
    return { track: root.height, thumb: rect.height, blockOffset: rect.top - root.top };
  });
}

/** Drive the real mechanism (`globals.css :root { font-size: calc(100% * var(--font-scale)) }`) and prove
 *  it took, so a harness that stopped loading client globals fails LOUD instead of measuring scale 1. */
async function applyFontScale(page: Page, scale: number): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.setProperty("--font-scale", String(value));
  }, scale);
  await expect.poll(async () => await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeCloseTo(16 * scale, 3);
}

for (const { scale, blockOffsetPx } of FRACTIONAL_ROOT_SCALES) {
  test(`--font-scale ${scale}: the thumb, the track and the centred gap are all whole device pixels (#1143 / #1640)`, async ({ mount, page }) => {
    const control = page.getByRole("switch");
    await mount(<Switch aria-label="Streaming" />);
    await applyFontScale(page, scale);
    await expect(control).toBeVisible();

    const boxes = await switchBoxes(control);
    expect(Number.isInteger(boxes.thumb), `thumb resolved ${boxes.thumb}px — the belt must land it on a whole pixel`).toBe(true);
    expect(Number.isInteger(boxes.track), `track resolved ${boxes.track}px — the belt must land it on a whole pixel`).toBe(true);
    expect(boxes.blockOffset, "the centred block gap — a fraction here is resampled at every DPR").toBe(blockOffsetPx);
  });
}

// ── #1684 (design-audit `off-grid-transform`, P3): THE RESTING KNOB LANDS ON WHOLE DEVICE PIXELS, IN
// BOTH REST POSITIONS AND AT BOTH POINTER CLASSES.
//
// The rule judges the raster an element's REST transform produces (docs/law/integer-line-boxes.md §9), and it fired
// on `span[data-slot=switch-thumb]` at `--appearance-preset reading` (fontScale 1.25) with "translate: 20px
// … lands top 0.484 / left 0.000 device px off the grid at DPR 1". Half of that fraction was this control's:
// the pre-#1684 knob was a fourth independently belted token, so `items-center` halved an ODD
// (content − thumb) at that scale and the knob rested at 8.5px. The other ~0.984 is the ancestor's landing
// (`setting-row-group > setting-row > field-control-col` — inherited, and filed separately); a primitive
// cannot fix an ancestor's landing, so what this pin owns is the knob's landing INSIDE its root, which is
// the whole of the primitive's contribution and is now whole at every font scale.
//
// Stated in DEVICE pixels (`× devicePixelRatio`) rather than CSS px because that is the quantity the rule
// judges, and read from `translate` — the individual property Tailwind v4's `translate-x-*` emits, which a
// matcher reading `transform` would see as `none`.
interface ThumbRestLanding {
  readonly dpr: number;
  readonly translate: string;
  readonly translateDevicePx: number;
  readonly blockDevicePx: number;
  readonly inlineDevicePx: number;
}

async function thumbRestLanding(control: Locator): Promise<ThumbRestLanding> {
  return await control.evaluate((el) => {
    const knob = el.querySelector('[data-slot="switch-thumb"]');
    if (knob === null) {
      throw new Error("no switch-thumb inside the switch root");
    }
    const root = el.getBoundingClientRect();
    const rect = knob.getBoundingClientRect();
    const declared = getComputedStyle(knob).translate;
    const dpr = window.devicePixelRatio;
    // UNROUNDED on purpose — the defect IS the fraction.
    return {
      dpr,
      translate: declared,
      translateDevicePx: (declared === "none" ? 0 : Number.parseFloat(declared)) * dpr,
      blockDevicePx: (rect.top - root.top) * dpr,
      inlineDevicePx: (rect.left - root.left) * dpr,
    };
  });
}

/** SETTLED first — the knob has a 130ms transform transition and a same-tick read reports a partial
 *  translate, which is a fraction that means nothing about the REST landing. */
async function expectWholePixelRest(control: Locator, when: string): Promise<void> {
  await settledThumb(control);
  const landing = await thumbRestLanding(control);
  expect(landing.dpr, `[${when}] this pin is stated in DEVICE px, so a DPR of 0 would make every claim below vacuous`).toBeGreaterThan(0);
  expect(
    Number.isInteger(landing.translateDevicePx),
    `[${when}] the resting translate is "${landing.translate}" = ${landing.translateDevicePx} device px`,
  ).toBe(true);
  expect(
    Number.isInteger(landing.blockDevicePx),
    `[${when}] the knob rests ${landing.blockDevicePx} device px below its root's top — a fraction here is the resampled raster #1684 filed`,
  ).toBe(true);
  expect(Number.isInteger(landing.inlineDevicePx), `[${when}] the knob rests ${landing.inlineDevicePx} device px from its root's left rim`).toBe(true);
}

/** The `reading` appearance preset's `fontScale`, and the exact cell #1684 was measured in. */
const READING_PRESET_SCALE = 1.25;

for (const scale of [1, READING_PRESET_SCALE] as const) {
  for (const checked of [false, true] as const) {
    const when = `fine · --font-scale ${scale} · ${checked ? "ON" : "OFF"}`;
    test(`the resting knob lands on whole device pixels inside its root (#1684) — ${when}`, async ({ mount, page }) => {
      await mount(<Switch aria-label="Streaming" defaultChecked={checked} />);
      const control = page.getByRole("switch");
      await applyFontScale(page, scale);
      await expect(control).toBeVisible();
      await expectWholePixelRest(control, when);
    });
  }
}

// ── THE COARSE-POINTER SHAPE PIN (side-eye #420, 2026-08-22). The two pins that existed before this
// block — the aspect pin above (fine context) and the height floor in touch-target-floor.suite.ct.tsx:119
// — were JOINTLY SATISFIABLE BY THE DEFECT: a 48x44 root with a 32px thumb inset 6/6 clears the 44px
// floor AND leaves the >1.4 aspect pin green, because that pin never runs at a coarse pointer. What
// shipped was a 1.091-aspect near-circle with track painting on all four sides of the thumb — read as a
// crescent moon, not a switch, on every touch surface. This block closes that hole: the SAME relations
// the fine arm promises, asserted in a coarse context. Relations, not literals — a later token retune
// may move 64/44, but a switch that stops reading as a switch fails here.
const COARSE_FLOOR = 44;
const MIN_ASPECT = 1.4;

test.describe("at a COARSE pointer", () => {
  // `hasTouch` is what flips `matchMedia("(pointer: coarse)")` in chromium — `page.emulateMedia` exposes
  // no `pointer` feature (touch-target-floor.suite.ct.tsx:23-28). Scoped to this describe so every other
  // case in this file keeps its fine-pointer context byte-for-byte.
  test.use({ hasTouch: true });

  test("the emulation really is coarse (this block's pins are vacuous at a fine pointer)", async ({ page }) => {
    // Hoisted, not inlined into expect(): a MEDIA-QUERY read is settled the instant the context exists
    // (it is context configuration, not a live DOM read), and the ct-no-oneshot gate reads the SHAPE
    // `expect(await …)`. Same spelling as the sibling probe at touch-target-floor.suite.ct.tsx:96-101.
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    const fine = await page.evaluate(() => matchMedia("(pointer: fine)").matches);
    expect(coarse, "hasTouch must make the @media(pointer:coarse) branch win").toBe(true);
    expect(fine, "the fine override must NOT apply under a coarse pointer").toBe(false);
  });

  test("the track stays a RECTANGLE while carrying the 44px floor, and the thumb travels the full track", async ({ mount, page }) => {
    await mount(<Switch aria-label="Streaming" />);
    const control = page.getByRole("switch");
    const thumb = control.locator('[data-slot="switch-thumb"]');
    const track = await control.boundingBox();
    const width = track?.width ?? 0;
    const height = track?.height ?? 1;

    // BOTH halves, together — either alone is satisfied by the crescent that shipped.
    expect(height, "the coarse root carries the ≥44px touch floor (pointer-coarse:h-touch-target)").toBeGreaterThanOrEqual(COARSE_FLOOR);
    expect(
      width / height,
      "…and it must still READ as a switch: a taller root needs a wider track, or the thumb sits in a near-circular field and the control reads as a crescent moon",
    ).toBeGreaterThan(MIN_ASPECT);

    // Travel is the other half of the read: the thumb must cross the track, not shuffle inside it.
    // Asserted as the #1109 RELATION between the two RENDERED track dimensions — `trackW − trackH`,
    // which is what an equally-inset knob crosses at any pointer (64 − 44 = 20 here) — rather than
    // against the token literals. Reading `TOKENS["spacing.switch-thumb"]` was sound while that token
    // WAS the fine track height doing double duty; now that the thumb is its own pointer-conditional
    // pair, a token-derived expectation would need the fine/coarse arm the static export cannot name,
    // and would go green on a tree that declared the split without rendering it.
    const expectedTravel = Math.round(width - height);
    const offX = (await thumb.boundingBox())?.x ?? 0;
    await control.click();
    await expect(control).toHaveAttribute("aria-checked", "true");
    // SETTLED, not mid-transition: the thumb has a 130ms transform transition and a same-tick rect read
    // reports a partial translate (the side-eye retracted exactly that false negative on this control).
    await expect.poll(async () => Math.round(((await thumb.boundingBox())?.x ?? 0) - offX), { intervals: [20, 50, 100, 150] }).toBe(expectedTravel);
  });

  // #424 is pointer-INDEPENDENT (the overhang is the border-box arithmetic, not a token value) and so
  // is #1109's proportion — the whole point of the split is that the knob scales WITH the pointer, so
  // the ratio has to hold in BOTH contexts or one arm ships a dot in a 64x44 field.
  test("the knob is proportional and equally inset here too (#1109 / #424)", async ({ mount, page }) => {
    await mount(<Switch aria-label="Streaming" />);
    const control = page.getByRole("switch");
    const parked = await thumbRims(control);
    const share = parked.thumbHeight / parked.rootHeight;
    expect(share, `coarse: thumb ${String(parked.thumbHeight)} in root ${String(parked.rootHeight)}`).toBeGreaterThanOrEqual(MIN_THUMB_SHARE);
    expect(share, `coarse: thumb ${String(parked.thumbHeight)} in root ${String(parked.rootHeight)}`).toBeLessThanOrEqual(MAX_THUMB_SHARE);
    expectEqualInset(parked, "coarse · unchecked");
    await control.click();
    await expect(control).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await thumbRims(control)).right, { intervals: [20, 50, 100, 150] }).toBe(parked.top);
  });

  // #1684's other pointer arm. The coarse triple (44 − 2×1 − 2×9 = 24) is a different set of belted
  // lengths from the fine one, so a derivation that is whole only at a fine pointer ships half the fix.
  for (const checked of [false, true] as const) {
    const when = `coarse · ${checked ? "ON" : "OFF"}`;
    test(`the resting knob lands on whole device pixels inside its root (#1684) — ${when}`, async ({ mount, page }) => {
      await mount(<Switch aria-label="Streaming" defaultChecked={checked} />);
      const control = page.getByRole("switch");
      await expect(control).toBeVisible();
      await expectWholePixelRest(control, when);
    });
  }
});

// ── tone axis (north-star §5 PP1 precedent; owner-sanctioned 2026-07-16). `accent` (default) keeps
// the ember-on-checked skin — the ONE sanctioned accent toggle per surface. `quiet` spends no accent, so
// a rack of per-row switches never multiplies it. The on/off signal stays position-carried (thumb travel)
// AND, since side-eye F-08, luminance-carried too. ──
//
// THE TWO TRACKS ARE LUMINANCE-SEPARATED — the property, not the token, and not a DIRECTION either: the
// checked track rides `--color-foreground`, which is bright on a dark theme and dark on a light one, so
// "brighter" is polarity-dependent while "clearly different" is the thing the eye actually needs.
// `quiet` used to ride `--color-secondary` (L 0.255) against an unchecked `bg-input` compositing to
// ≈L 0.286 — a 0.03 separation, i.e. none, so a twelve-row rack signalled its state with a 10px thumb
// offset and nothing else (side-eye F-08). Asserting the RELATION is what makes this pin bite: a token
// swap that collapses the two again fails here, where "background-color equals token X" stays green.
const MIN_LUMINANCE_SEPARATION = 0.15;

test("tone=quiet: checked spends no ember AND is LUMINANCE-SEPARATED from unchecked (F-08)", async ({ mount, page }) => {
  await mount(
    <>
      <Switch aria-label="Row toggle off" tone="quiet" />
      <Switch aria-label="Row toggle on" defaultChecked={true} tone="quiet" />
    </>,
  );
  const off = page.getByRole("switch", { name: "Row toggle off" });
  const on = page.getByRole("switch", { name: "Row toggle on" });

  // No accent, either way — that is the whole point of the tone.
  await expect(on).not.toHaveCSS("background-color", TOKENS["color.primary"].value);

  // COMPOSITED relative luminance, measured the only honest way: PAINT it. Both tracks are semi-transparent
  // (`bg-input` is a 12% overlay; the checked track a 55% one) and both resolve in oklch, so parsing
  // `backgroundColor` numerically would be reading L/C/H as if they were R/G/B — a number that moves with
  // the HUE. A 1×1 canvas composites the real color over the real backdrop and hands back sRGB.
  const luminance = async (control: typeof on): Promise<number> =>
    await control.evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (ctx === null) {
        throw new Error("no 2d context");
      }
      // The rack's real backdrop, so the comparison is the one the eye makes on the surface.
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-card").trim();
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = getComputedStyle(el).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
      const channel = (value: number): number => {
        const srgb = value / 255;
        return srgb <= 0.039_28 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    });

  const [onLuminance, offLuminance] = await Promise.all([luminance(on), luminance(off)]);
  expect(Math.abs(onLuminance - offLuminance)).toBeGreaterThan(MIN_LUMINANCE_SEPARATION);
});

test("tone=quiet: still toggles and the thumb still travels — state is position, not color", async ({ mount, page }) => {
  await mount(<Switch aria-label="Row toggle" tone="quiet" />);
  const control = page.getByRole("switch");
  const thumb = control.locator('[data-slot="switch-thumb"]');
  const offX = (await thumb.boundingBox())?.x ?? 0;
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  // Same 14px travel as accent (thumb translate is tone-independent) — the a11y on/off signal holds.
  await expect.poll(async () => (await thumb.boundingBox())?.x ?? 0, { intervals: [20, 50, 100] }).toBeGreaterThan(offX + 12);
});

// ── THE QUIET STATE MUST BE THE QUIET ONE (#1090; side-eye F10/E3 2026-08-30, re-measured 2026-09-02).
// The OFF thumb was `bg-foreground` — the page's brightest ink, opaque, 32 of the track's 48px — so an
// OFF switch's loudest object measured 11.118:1 here while the ON accent track measured 6.824:1 (this
// pin's own red-first run). `design-audit`'s `quiet-state` rule filed it as P2 in every appearance arm:
// "OFF 12.58:1 vs ON 7.06:1". The surface spent its loudest register on the state that carries no
// information — six near-white pills that mean "off".
//
// PINNED THE WAY THE RULE MEASURES IT: `quiet-state` ranks each state by its LOUDEST member —
// max(track vs pane, thumb vs track), because that is the object the eye lands on — so this pin does
// the same, on both tones, in every seed polarity.
//
// FRAMEBUFFER, NOT COMPUTED STYLE. `bg-input` is a 12%/13%/16% overlay and the OFF thumb is itself an
// alpha of `--color-muted-foreground`, so what the eye reads exists only after compositing; every token
// also resolves in `oklch`, where a numeric parse of `backgroundColor` reads L/C/H as if they were
// R/G/B (`oklch-kills-rgb-regex-probes`). `pixelSurface` decodes the real pixels.
//
// ALL THREE SEEDS, because a polarity fix proven on the dark arm alone is this tree's recorded failure
// family (`light-theme-polarity-receipts`): under Light the same tokens inverted their roles and the
// ON accent has the LEAST contrast to spend (6.02:1), so Light — not Hearth — is the binding arm.
const SEED_THEMES = ["hearth", "light", "mocha"] as const;
/** The track shows only at the end the thumb is NOT parked at: OFF parks left, ON parks right. Sampled
 *  across the pill's waist, inside the root's own border. */
const TRACK_BEHIND_PARKED_THUMB: Readonly<Record<"off" | "on", PixelSurfaceRegion>> = {
  off: { x0: 0.8, x1: 0.96, y0: 0.35, y1: 0.65 },
  on: { x0: 0.04, x1: 0.2, y0: 0.35, y1: 0.65 },
};

/** The strip of track directly ABOVE the parked thumb — across the knob's OWN x-span, below the root's
 *  1px border and above the knob's top edge. This is the band a fill probe resolves a fill-only subject
 *  against (`snap --contrast`'s fill arm shoots a 4px margin around the box and takes its MODAL colour),
 *  and it is the whole of #1170: while the thumb was as tall as the track it had no track above or below
 *  it, so on `settings:chat-behavior` the ON knob's band came back 72% PAGE (15,12,10) and the arm
 *  measured `--color-primary-foreground` against the page instead of against its ember track — 1.05:1
 *  FAIL for a knob that is 7:1 against the thing it actually sits on. Fractions of the ROOT's box: at a
 *  fine pointer 0.09..0.18 of 32px is y 2.9..5.8, inside a track whose knob now starts at y 7. */
const TRACK_ABOVE_PARKED_THUMB: Readonly<Record<"off" | "on", PixelSurfaceRegion>> = {
  off: { x0: 0.2, x1: 0.42, y0: 0.09, y1: 0.18 },
  on: { x0: 0.58, x1: 0.8, y0: 0.09, y1: 0.18 },
};

/** Two samples of one surface differ only by anti-aliasing; 1.1:1 is far below the 3:1 the same pair
 *  reaches when one of them is actually the knob (measured 4.1:1 OFF / 7.1:1 ON on Hearth). */
const SAME_SURFACE_MAX_RATIO = 1.1;

/** All three seeds side by side in ONE mount. playwright-ct refuses a second `mount()` in a test
 *  ("Attempting to mount a component into a container that already has a React root"), and `hearth` IS
 *  the base `@theme` at `:root` — theme.css emits `[data-theme]` blocks for light + mocha only — so the
 *  hearth arm is the unattributed pane. */
const seedThemePanes = (): ReactElement => (
  <>
    {SEED_THEMES.map((theme) => (
      <div className="bg-card p-gutter" key={theme} {...(theme === "hearth" ? {} : { "data-theme": theme })}>
        {/* An empty block over the pane fill: its pixels ARE the pane, so the backdrop reading needs
              no guess about how much of a wrapper the controls happen to cover. */}
        <div className="h-block w-block" data-testid={`pane-${theme}`} />
        <Switch aria-label={`${theme} accent off`} />
        <Switch aria-label={`${theme} accent on`} defaultChecked={true} />
        <Switch aria-label={`${theme} quiet off`} tone="quiet" />
        <Switch aria-label={`${theme} quiet on`} defaultChecked={true} tone="quiet" />
      </div>
    ))}
  </>
);

/** The loudest member of one state, each measured against the surface actually behind it: the track
 *  against the pane, the thumb against the track it sits in — the way `quiet-state` resolves it. */
async function stateLoudness(page: Page, name: string, state: "off" | "on", pane: PixelSurfaceReceipt): Promise<{ value: number; describe: string }> {
  const root = page.getByRole("switch", { name });
  const thumb = root.locator('[data-slot="switch-thumb"]');
  // SETTLED, not mid-transition: the thumb has a 130ms transform transition and the track strip is
  // addressed relative to where the thumb has PARKED — a same-tick read samples the knob instead.
  await settledThumb(root);
  const track = await pixelSurface(page, root, { region: TRACK_BEHIND_PARKED_THUMB[state] });
  const knob = await pixelSurface(page, thumb);
  const trackRatio = contrastRatio(track.rgb, pane.rgb);
  const thumbRatio = contrastRatio(knob.rgb, track.rgb);
  return {
    value: Math.max(trackRatio, thumbRatio),
    describe: `${name}: track ${track.describe} ${trackRatio.toFixed(3)}:1 vs pane ${pane.describe} · thumb ${knob.describe} ${thumbRatio.toFixed(3)}:1 vs track`,
  };
}

test("the OFF state is measurably QUIETER than the ON state, on both tones and every seed theme (#1090)", async ({ mount, page }) => {
  await mount(seedThemePanes());
  for (const theme of SEED_THEMES) {
    const pane = await pixelSurface(page, page.getByTestId(`pane-${theme}`));
    const accentOff = await stateLoudness(page, `${theme} accent off`, "off", pane);
    const accentOn = await stateLoudness(page, `${theme} accent on`, "on", pane);
    const quietOff = await stateLoudness(page, `${theme} quiet off`, "off", pane);
    const quietOn = await stateLoudness(page, `${theme} quiet on`, "on", pane);

    // THE UN-FAILABLE GUARD. Every ratio above collapses to 1.000 if the samples come back as one
    // colour — a clipped screenshot, a region off the box, a `[data-theme]` that never applied — and an
    // ordering pin over constant inputs passes on nothing. The ON accent track must be really painted.
    expect(
      contrastRatio(
        (await pixelSurface(page, page.getByRole("switch", { name: `${theme} accent on` }), { region: TRACK_BEHIND_PARKED_THUMB.on })).rgb,
        pane.rgb,
      ),
      `[${theme}] the ON accent track must be a real painted fill, or this pin is vacuous`,
    ).toBeGreaterThan(3);

    expect(accentOff.value, `[${theme}] tone=accent — ${accentOff.describe} || ${accentOn.describe}`).toBeLessThan(accentOn.value);
    expect(quietOff.value, `[${theme}] tone=quiet — ${quietOff.describe} || ${quietOn.describe}`).toBeLessThan(quietOn.value);
  }
});

// ── #1170: THE SURROUND A FILL PROBE FINDS AROUND THE KNOB IS THE TRACK, ON EVERY SIDE.
//
// TWO CLAUSES, and only the pair is the fix. The FLOOR half (#1090's other side) is a FENCE, honestly
// labelled: quieting the knob may not erase it — 1.4.11 asks 3:1 of the visual information that
// identifies a control's state and the knob IS that information — but it was green on the pre-#1090
// source by construction (an 11.118:1 knob clears 3:1 trivially), so what it locks out is the next
// tune-down. The SURROUND half is the actual #1170 defect proof and is RED on the pre-#1109 source: a
// knob as tall as its track has no track above or below it, so `snap --contrast`'s fill arm resolved
// `[data-slot=switch-thumb]` against a band that was 72% PAGE and printed FILL 1.05:1 FAIL —
// `--color-primary-foreground` (31,16,7) measured against `--color-background` (15,12,10) instead of
// against the ember track it sits on. The instrument was right; the geometry was the defect.
//
// BOTH STATES, because the ON knob is the one the live route reported and the OFF knob is the one #1090
// re-toned — and the SURROUND clause is what makes the FLOOR clause meaningful, since a floor measured
// against a strip that is not the real neighbour is the unquotable number this family keeps producing.
test("the knob is surrounded by TRACK on every side, and clears 3:1 against it — OFF and ON, every seed (#1170 / #1090)", async ({ mount, page }) => {
  await mount(seedThemePanes());
  for (const theme of SEED_THEMES) {
    for (const state of ["off", "on"] as const) {
      const root = page.getByRole("switch", { name: `${theme} accent ${state}` });
      await settledThumb(root);
      const track = await pixelSurface(page, root, { region: TRACK_BEHIND_PARKED_THUMB[state] });
      const above = await pixelSurface(page, root, { region: TRACK_ABOVE_PARKED_THUMB[state] });
      const knob = await pixelSurface(page, root.locator('[data-slot="switch-thumb"]'));
      expect(
        contrastRatio(above.rgb, track.rgb),
        `[${theme}/${state}] the strip ABOVE the knob (${above.describe}) must be the same surface as the track beside it (${track.describe}) — if it is the pane, a fill probe measures the knob against the page`,
      ).toBeLessThan(SAME_SURFACE_MAX_RATIO);
      expect(contrastRatio(knob.rgb, track.rgb), `[${theme}/${state}] knob ${knob.describe} on track ${track.describe}`).toBeGreaterThanOrEqual(3);
    }
  }
});

test("tone=accent (explicit) matches the default — checked wears ember", async ({ mount, page }) => {
  await mount(<Switch aria-label="The one accent toggle" defaultChecked={true} tone="accent" />);
  await expect(page.getByRole("switch")).toHaveCSS("background-color", TOKENS["color.primary"].value);
});

test("onCheckedChange reports the next state", async ({ mount, page }) => {
  const seen: boolean[] = [];
  await mount(
    <Switch
      aria-label="Streaming"
      onCheckedChange={(checked): void => {
        seen.push(checked);
      }}
    />,
  );
  await page.getByRole("switch").click();
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe(true);
});

test("read-only: blocks toggling but keeps the checked token + shows the lock glyph", async ({ mount, page }) => {
  await mount(<Switch aria-label="Autopilot" checked={true} readOnly={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("data-readonly", "");
  // A read-only switch is NOT the disabled grey-out — it still wears the primary "on" token.
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await expect(control).toHaveCSS("opacity", "1");
  // The non-color signal: a lock glyph rides the thumb, visible only in the read-only state.
  await expect(control.locator("svg")).toBeVisible();
  // Clicking (and Space) must not flip the state — Base UI's readOnly behavior.
  await control.click();
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "true");
});

test("read-only off state: unchecked token holds and the lock glyph still shows", async ({ mount, page }) => {
  await mount(<Switch aria-label="Autopilot" checked={false} readOnly={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(control.locator("svg")).toBeVisible();
});

test("non-read-only switch never shows the lock glyph", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  await expect(page.getByRole("switch").locator("svg")).toBeHidden();
});

test("disabled blocks toggling and drops the interactive skin", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" disabled={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("data-disabled", "");
  await expect(control).toHaveCSS("opacity", "0.5");
  await control.click({ force: true });
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("inside an invalid <Field>, data-invalid lands and the border swaps to destructive", async ({ mount, page }) => {
  await mount(
    <Field error="Required" label="Streaming">
      <Switch />
    </Field>,
  );
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("data-invalid", "");
  await expect(control).toHaveCSS("border-top-color", resolvedTokenColor("color.destructive"));
});

test("inside a <Field>, the label associates and aria-describedby wires the description", async ({ mount, page }) => {
  await mount(
    <Field description="Live-updates as tokens arrive" label="Streaming">
      <Switch />
    </Field>,
  );
  // getByLabel also matches the hidden native input Base UI rides beside the styled span (R2) —
  // scope to the accessible role so the assertion targets the actual control under test.
  const control = page.getByRole("switch", { name: "Streaming" });
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});
