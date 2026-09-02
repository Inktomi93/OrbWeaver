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
import type { PixelSurfaceReceipt, PixelSurfaceRegion } from "../../../support/ct/pixel-contrast.ts";
import { pixelSurface } from "../../../support/ct/pixel-contrast.ts";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

const NON_EMPTY = /.+/u;

/**
 * The thumb's gap to each rim of the ROOT's border box, plus the root's own rendered border width —
 * the #424 measurement. Read in ONE evaluate so both rects come from the same layout, and returned as
 * rounded px because the only defect this can express is a whole-border-width overhang.
 */
async function thumbRims(control: Locator): Promise<{ left: number; right: number; top: number; bottom: number; border: number }> {
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
    };
  });
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
  // Travel = switch-track − switch-thumb − 2×border = 48 − 32 − 2 = 14px (thumb raised to 32px for the
  // tap-target floor, Task #76; the two borders subtracted at #424 — the root is border-box, so the thumb
  // travels inside a content box narrower than the track token). The old fine travel was ~4px; assert
  // well past that so a regression toward
  // a near-square track fails here. Poll past the 130ms transform transition (the thumb slides,
  // boundingBox tracks the transform mid-animation).
  await expect.poll(async () => (await thumb.boundingBox())?.x ?? 0, { intervals: [20, 50, 100] }).toBeGreaterThan(offX + 12);
});

// ── #424: THE THUMB LIVES INSIDE THE BORDER. The root is `border-box` with a border, so its CONTENT
// box is 2×border narrower than `--spacing-switch-track` — a travel of `track − thumb` spends the full
// token and pushes the checked knob one border-width PAST the right rim (measured −1 at both pointers
// before the fix; side-eye #420 P3). Asserted as a RELATION against the root's own rendered
// border-width, so a border-width retune moves the expectation with the design instead of pinning 1.
test("the thumb sits INSIDE the root's border at both ends of its travel (#424)", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  const parked = await thumbRims(control);
  expect(parked.border, "the root must actually paint a border, or this pin is vacuous").toBeGreaterThan(0);
  // The RESIDUAL this fix deliberately leaves (measured, so a later change to it is visible here): the
  // thumb is exactly as tall as the root at a fine pointer, so it stays flush with the root's OUTER box
  // vertically. Inset-ing it would mean shrinking the display thumb — a size decision, not this defect.
  expect(parked.top, "the thumb stays vertically flush with the root's OUTER box (unchanged by #424)").toBe(0);
  expect(parked.bottom, "the thumb stays vertically flush with the root's OUTER box (unchanged by #424)").toBe(0);
  expect(parked.left, "unchecked: the thumb starts at the content box's left edge, not on the border").toBe(parked.border);
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  // SETTLED, not mid-transition: the thumb has a 130ms transform transition (the same false negative
  // the side-eye retracted on this control), so poll the rim rather than reading it same-tick.
  await expect.poll(async () => (await thumbRims(control)).right, { intervals: [20, 50, 100, 150] }).toBe(parked.border);
});

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
    // Measured against the TOKENS' own static literals (which ARE the coarse values — the generator is
    // coarse-first and narrows fine in an @media block, tokens.build.ts:104), so a retune moves the
    // expectation with the design instead of pinning a constant.
    const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    const remPx = (value: string): number => Number.parseFloat(value) * rem;
    // MINUS the two borders (#424): the root is border-box, so the thumb travels inside a content box
    // 2×--border-width-control narrower than the track token. Coarse arithmetic: 64 − 32 − 2×1 = 30.
    const borders = 2 * Number.parseFloat(TOKENS["border-width.control"].value);
    const expectedTravel = Math.round(remPx(TOKENS["spacing.switch-track"].value) - remPx(TOKENS["spacing.switch-thumb"].value) - borders);
    const offX = (await thumb.boundingBox())?.x ?? 0;
    await control.click();
    await expect(control).toHaveAttribute("aria-checked", "true");
    // SETTLED, not mid-transition: the thumb has a 130ms transform transition and a same-tick rect read
    // reports a partial translate (the side-eye retracted exactly that false negative on this control).
    await expect.poll(async () => Math.round(((await thumb.boundingBox())?.x ?? 0) - offX), { intervals: [20, 50, 100, 150] }).toBe(expectedTravel);
  });

  // #424 is pointer-INDEPENDENT (the overhang is the border-box arithmetic, not a token value), so the
  // rim pin runs in the coarse context too — the wider track must not put the knob back over the rim.
  test("the thumb sits INSIDE the root's border here too (#424)", async ({ mount, page }) => {
    await mount(<Switch aria-label="Streaming" />);
    const control = page.getByRole("switch");
    const parked = await thumbRims(control);
    expect(parked.left, "unchecked: the thumb starts at the content box's left edge").toBe(parked.border);
    await control.click();
    await expect(control).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await thumbRims(control)).right, { intervals: [20, 50, 100, 150] }).toBe(parked.border);
  });
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
  const border = (await thumbRims(root)).border;
  await expect.poll(async () => (await thumbRims(root))[state === "on" ? "right" : "left"], { intervals: [20, 50, 100, 150] }).toBe(border);
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

test("the OFF thumb still clears the WCAG 1.4.11 3:1 floor against its own track, in every seed theme (#1090)", async ({ mount, page }) => {
  // The other side of the polarity fix: quieting the knob may not erase it. 1.4.11 asks 3:1 of the
  // visual information that identifies a control's state, and the OFF knob IS that information — so the
  // fix has a floor as well as a ceiling, and the pair together is what makes the value non-arbitrary.
  // HONESTLY LABELLED: this is a FENCE, not a defect proof. It was GREEN on the pre-#1090 source by
  // construction (an 11.118:1 knob clears 3:1 trivially); what it locks out is the next tune-down.
  await mount(seedThemePanes());
  for (const theme of SEED_THEMES) {
    const root = page.getByRole("switch", { name: `${theme} accent off` });
    const track = await pixelSurface(page, root, { region: TRACK_BEHIND_PARKED_THUMB.off });
    const knob = await pixelSurface(page, root.locator('[data-slot="switch-thumb"]'));
    const ratio = contrastRatio(knob.rgb, track.rgb);
    expect(ratio, `[${theme}] OFF thumb ${knob.describe} on track ${track.describe}`).toBeGreaterThanOrEqual(3);
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
