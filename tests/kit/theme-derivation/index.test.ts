// Mirror test for kit/theme-derivation — the D71 derivation numbers + the node-side prediction of them.
//
// The point of this module is that TWO packages that cannot see each other must agree about one derivation:
// `@orb/ui`'s clamp emits the CSS a browser evaluates, and `@orb/server`'s ST theme importer predicts the
// result to decide whether a foreign palette converts safely. So the tests pin (1) that the ui clamp really
// reads these numbers rather than carrying its own copy — the whole reason they moved down the cake — and
// (2) that the safety predicate DISCRIMINATES, with a positive and a negative control on each side of the
// documented pivot mid-band.

import {
  AA_NORMAL_RATIO,
  compositeSrgb,
  derivedForeground,
  derivedForegroundLightness,
  isDerivableBaseSurface,
  oklabToOklch,
  oklchToSrgb,
  proseInkLightness,
  READING_BAND_ALPHA,
  rampDeltas,
  rampSurface,
  readingBandSurface,
  readingPlateAlpha,
  shadowIngredients,
  srgbToOklch,
  THEME_DERIVATION,
  wcagContrastRatio,
} from "@orb/kit/theme-derivation";
import { describe } from "vitest";
import { THEME_DERIVATION as UI_THEME_DERIVATION } from "../../../packages/ui/src/content/theme-scope/clamp.ts";
import { expect, test } from "../../support/fixtures.ts";

describe("THEME_DERIVATION", () => {
  test("is the SAME object the ui clamp exposes — one home, no drift", () => {
    // If clamp.ts ever re-declares its own numbers, this identity check fails before the divergence can
    // reach a rendered pixel or a wrong import decision.
    expect(UI_THEME_DERIVATION).toBe(THEME_DERIVATION);
  });
});

describe("shadowIngredients (#243 — the polarity-derived elevation recipe)", () => {
  const darkBase = { l: 0.158, c: 0.006, h: 60 };
  const lightBase = { l: 0.98, c: 0.004, h: 75 };
  const roles = ["hairline", "highlight", "ambientNear", "ambientFar", "ctaHighlight"] as const;

  test("the DARK arm is the base @theme recipe, digit for digit (the sacred rooms cannot move)", () => {
    const { hairline, highlight, ambientNear, ambientFar, ctaHighlight } = shadowIngredients(darkBase);
    // These five ARE `--color-shadow-*` in theme.css's @theme block. Every one is chroma 0, which is what
    // makes the emitted relative colour (`oklch(from <base> l 0 h / a)`) the same white/black pixel the
    // literal spells: hue is powerless at chroma 0, so a dark custom theme's ingredients are unchanged.
    expect([hairline.l, hairline.c, hairline.alpha]).toEqual([1, 0, 0.06]);
    expect([highlight.l, highlight.c, highlight.alpha]).toEqual([1, 0, 0.08]);
    expect([ambientNear.l, ambientNear.c, ambientNear.alpha]).toEqual([0, 0, 0.4]);
    expect([ambientFar.l, ambientFar.c, ambientFar.alpha]).toEqual([0, 0, 0.5]);
    expect([ctaHighlight.l, ctaHighlight.c, ctaHighlight.alpha]).toEqual([1, 0, 0.15]);
  });

  test("the LIGHT arm inverts the ring, mutes the drop, and switches the inset OFF", () => {
    const light = shadowIngredients(lightBase);
    const dark = shadowIngredients(darkBase);
    // The ring stops being light-from-above: a DARK hairline (the white one measured 1.00-1.02:1 against
    // a light page — invisible), at more than twice the alpha because a dark ring at 0.06 is a whisper.
    expect(light.hairline.l).toBeLessThan(dark.hairline.l);
    expect(light.hairline.alpha).toBeGreaterThan(dark.hairline.alpha);
    // The inset top-highlight paints nothing on a near-white card, so it is spent to zero rather than
    // left as a value nobody can see.
    expect(light.highlight.alpha).toBe(0);
    // The drops stay DROPS (darker than the surface) but lift off pure black at a third of the alpha —
    // the "torn-out sticker" the Light seed was retuned to kill.
    for (const role of ["ambientNear", "ambientFar"] as const) {
      expect(light[role].l).toBeGreaterThan(dark[role].l);
      expect(light[role].l).toBeLessThan(lightBase.l);
      expect(light[role].alpha).toBeLessThan(dark[role].alpha);
    }
    // …and the CTA catch is on the PRIMARY fill, not a surface, so the light arm STRENGTHENS it.
    expect(light.ctaHighlight.alpha).toBeGreaterThan(dark.ctaHighlight.alpha);
  });

  test("every ingredient carries the PALETTE's hue — elevation tints with the theme, never with Hearth", () => {
    for (const base of [darkBase, lightBase, { l: 0.95, c: 0.03, h: 280 }]) {
      for (const role of roles) {
        expect(shadowIngredients(base)[role].h, role).toBe(base.h);
      }
    }
  });

  test("the polarity flip rides fgPivotL — the SAME threshold as the foreground and color-scheme", () => {
    const { fgPivotL } = THEME_DERIVATION;
    // Strictly above the pivot is light (colorSchemeFor's boundary), so the pivot itself is the dark
    // arm's ceiling — text polarity and elevation polarity can never disagree about one base.
    expect(shadowIngredients({ l: fgPivotL, c: 0.01, h: 60 }).highlight.alpha).toBe(THEME_DERIVATION.shadow.dark.highlight.alpha);
    expect(shadowIngredients({ l: fgPivotL + 0.01, c: 0.01, h: 60 }).highlight.alpha).toBe(THEME_DERIVATION.shadow.light.highlight.alpha);
  });
});

describe("rampDeltas (#682 — the polarity-derived neutral surface ramp)", () => {
  const darkBase = { l: 0.158, c: 0.006, h: 60 };
  const lightBase = { l: 0.98, c: 0.004, h: 75 };
  const roles = ["sidebar", "surfaceRaised", "card", "popover", "accent", "sidebarAccent", "secondary", "muted"] as const;

  test("the DARK arm is the pre-#682 additive block, digit for digit (the dark rooms cannot move)", () => {
    expect(rampDeltas(darkBase)).toEqual({
      sidebar: -0.026,
      surfaceRaised: 0.027,
      card: 0.047,
      popover: 0.087,
      accent: 0.127,
      sidebarAccent: 0.077,
      secondary: 0.097,
      muted: 0.097,
    });
  });

  test("the LIGHT arm IS the shipped Light seed's own block, promoted (nothing invented)", () => {
    // theme.css `[data-theme="light"]`, base oklch(0.98 0.004 75): sidebar 0.955 · surface-raised 0.965 ·
    // card/popover 0.995 · accent 0.93 · sidebar-accent 0.90 · secondary 0.94 · muted 0.95. The arm is
    // that hand-authored value-set expressed as deltas, so a CUSTOM near-white theme derives the chrome
    // the seed always had instead of one saturated white.
    const seedL = { sidebar: 0.955, surfaceRaised: 0.965, card: 0.995, popover: 0.995, accent: 0.93, sidebarAccent: 0.9, secondary: 0.94, muted: 0.95 };
    const light = rampDeltas(lightBase);
    for (const role of roles) {
      expect(lightBase.l + light[role], `${role} off the Light seed base`).toBeCloseTo(seedL[role], 4);
    }
  });

  test("the light arm RECEDES where the dark arm rises — the clamp collapse cannot recur", () => {
    const dark = rampDeltas(darkBase);
    const light = rampDeltas(lightBase);
    // Every member the dark arm lifts by more than a hair is a member with no headroom on a near-white
    // base; the light arm's answer is at most a sixth of the rise, and for the low-emphasis family it is
    // negative outright.
    for (const role of ["accent", "sidebarAccent", "secondary", "muted", "surfaceRaised"] as const) {
      expect(dark[role], `${role} rises on a dark base`).toBeGreaterThan(0);
      expect(light[role], `${role} recedes on a light base`).toBeLessThan(0);
    }
    // The defect, stated as the property: the tones a graphic is painted FROM and painted ON stay apart.
    expect(lightBase.l + light.card).toBeLessThanOrEqual(1);
    expect(light.card).not.toBe(light.muted);
  });

  test("the polarity flip rides fgPivotL — the SAME threshold as the foreground, color-scheme and elevation", () => {
    const { fgPivotL } = THEME_DERIVATION;
    expect(rampDeltas({ l: fgPivotL, c: 0.01, h: 60 })).toBe(THEME_DERIVATION.ramp.dark);
    expect(rampDeltas({ l: fgPivotL + 0.01, c: 0.01, h: 60 })).toBe(THEME_DERIVATION.ramp.light);
  });
});

describe("derivedForegroundLightness", () => {
  test("flips light↔dark around the pivot, clamped to the readable band", () => {
    const { fgPivotL, fgLMin, fgLMax } = THEME_DERIVATION;
    // A dark surface gets near-white text…
    expect(derivedForegroundLightness(0.15)).toBe(fgLMax);
    // …a light surface gets near-black…
    expect(derivedForegroundLightness(0.95)).toBe(fgLMin);
    // …and the pivot itself resolves to the dark arm's ceiling (the `(pivot - l)` sign, matching clamp.ts).
    expect(derivedForegroundLightness(fgPivotL)).toBe(fgLMin);
  });
});

describe("wcagContrastRatio", () => {
  test("matches the WCAG extremes", () => {
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    expect(wcagContrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(wcagContrastRatio(white, white)).toBeCloseTo(1, 5);
  });
});

describe("oklchToSrgb", () => {
  test("round-trips the published primaries back to sRGB", () => {
    // The inverse of the importer's sRGB→OKLCH; a transposed coefficient shows up as a wrong channel here.
    const red = oklchToSrgb({ l: 0.628, c: 0.2577, h: 29.23 });
    expect(red.r).toBeCloseTo(255, 0);
    expect(red.g).toBeCloseTo(0, 0);
    expect(red.b).toBeCloseTo(0, 0);
  });
});

describe("isDerivableBaseSurface", () => {
  test("accepts the realistic dark + light bases orb's own palettes use", () => {
    // The same representative bases the ui palette-contrast suite sweeps (Mocha/Hearth-dark and Light).
    for (const l of [0.1, 0.15, 0.158, 0.2, 0.25]) {
      expect(isDerivableBaseSurface({ l, c: 0.015, h: 250 }), `dark base L=${l}`).toBe(true);
    }
    for (const l of [0.9, 0.95, 0.98]) {
      expect(isDerivableBaseSurface({ l, c: 0.01, h: 60 }), `light base L=${l}`).toBe(true);
    }
  });

  test("REFUSES the pivot mid-band — the documented limitation, which a foreign palette CAN hit", () => {
    // PLANTED POSITIVE CONTROL. No hand-authored orb palette lands here, so without this the predicate would
    // be a fence nobody has ever seen bite. A mid-grey page surface is inherently low-contrast for any
    // sub-maximal derived tone; the SillyTavern importer refuses such a theme rather than importing it.
    // The band is MEASURED (see the boundary test below), not assumed from the prose approximation.
    for (const l of [0.45, 0.5, 0.55, 0.6, 0.62, 0.63, 0.65, 0.68]) {
      expect(isDerivableBaseSurface({ l, c: 0.01, h: 250 }), `mid-band base L=${l}`).toBe(false);
    }
  });

  test("the refused band's EDGES are where the measurement puts them (0.443 … 0.686)", () => {
    // NEGATIVE CONTROLS either side. This is the number the ST importer's refusal reason describes, and it
    // is narrower than `palette-contrast.suite.test.ts`'s prose approximation ("~0.28–0.62") — that comment
    // is a rough exclusion range for a sweep, not a measured boundary, so it is not the authority here.
    //
    // THE UPPER EDGE MOVED 0.63 → 0.686 WITH #682, and that is the two-arm ramp being honest rather than a
    // regression. Above the pivot the chrome now RECEDES from the base instead of saturating at white, so a
    // base sitting just over the pivot derives a sidebar-accent at L−0.08 that its near-black text reads at
    // 3.56:1 — sub-AA. The old arm hid that by clamping every surface toward white; the palettes in the
    // widened slice were never legible, they were unmeasured. The lower edge is untouched: the dark arm did
    // not move a digit.
    expect(isDerivableBaseSurface({ l: 0.44, c: 0.01, h: 250 }), "just below the band").toBe(true);
    expect(isDerivableBaseSurface({ l: 0.69, c: 0.01, h: 250 }), "just above the band").toBe(true);
  });

  test("its verdict AGREES with a direct contrast measurement of the worst ramp pairing", () => {
    // Not a tautology: it re-derives the same judgement from the primitive parts, so a bug in the surface
    // LIST inside the predicate (a missing ramp member) would show up as a disagreement here.
    const base = { l: 0.5, c: 0.01, h: 250 };
    const worst = rampSurface(base, rampDeltas(base).popover);
    const ratio = wcagContrastRatio(oklchToSrgb(derivedForeground(base)), oklchToSrgb(worst));
    expect(ratio).toBeLessThan(AA_NORMAL_RATIO);
    expect(isDerivableBaseSurface(base)).toBe(false);
  });
});

describe("srgbToOklch (#204 — the format-widening inverse)", () => {
  test("round-trips oklchToSrgb on realistic surfaces and inks", () => {
    for (const o of [
      { l: 0.158, c: 0.006, h: 60 },
      { l: 0.98, c: 0.004, h: 78 },
      // In-gamut samples only: oklchToSrgb gamut-clamps, so an out-of-gamut chroma round-trips smaller
      // BY DESIGN — that is the clamp working, not a transposed coefficient.
      { l: 0.53, c: 0.1, h: 58 },
      { l: 0.86, c: 0.08, h: 85 },
    ]) {
      // 8-bit channel quantization bounds the round-trip at ~1e-3 — far under any judgment-relevant
      // delta (the clamp's decisions move in tenths of L).
      const back = srgbToOklch(oklchToSrgb(o));
      expect(back.l, `L of ${JSON.stringify(o)}`).toBeCloseTo(o.l, 2);
      expect(back.c, `C of ${JSON.stringify(o)}`).toBeCloseTo(o.c, 2);
      expect(back.h, `H of ${JSON.stringify(o)}`).toBeCloseTo(o.h, 0);
    }
  });

  test("reads the extremes: black is L≈0, white is L≈1, both achromatic", () => {
    const black = srgbToOklch({ r: 0, g: 0, b: 0 });
    expect(black.l).toBeCloseTo(0, 4);
    const white = srgbToOklch({ r: 255, g: 255, b: 255 });
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeCloseTo(0, 3);
  });
});

describe("oklabToOklch", () => {
  test("re-polarises the a/b axes: chroma is their magnitude, hue their angle, L untouched", () => {
    // A pure +a colour sits at hue 0; +b at 90 — the standard OKLab→OKLCH polar reading.
    expect(oklabToOklch(0.5, 0.1, 0)).toEqual({ l: 0.5, c: 0.1, h: 0 });
    const quarter = oklabToOklch(0.5, 0, 0.1);
    expect(quarter.c).toBeCloseTo(0.1, 10);
    expect(quarter.h).toBeCloseTo(90, 10);
    // Negative axes wrap into [0,360) rather than going negative (the hue the clamp emits from).
    expect(oklabToOklch(0.5, -0.1, 0).h).toBeCloseTo(180, 10);
    expect(oklabToOklch(0.5, 0, -0.1).h).toBeCloseTo(270, 10);
    // Achromatic: no chroma, and the round-trip agrees with the sRGB reader on a real grey.
    expect(oklabToOklch(0.4, 0, 0).c).toBe(0);
    const grey = srgbToOklch({ r: 128, g: 128, b: 128 });
    expect(oklabToOklch(grey.l, 0, 0).l).toBeCloseTo(grey.l, 10);
  });
});

describe("compositeSrgb (#204 — the plate/ink alpha math)", () => {
  test("interpolates channels linearly in sRGB space, clamping alpha to [0,1]", () => {
    const top = { r: 200, g: 100, b: 0 };
    const under = { r: 0, g: 100, b: 200 };
    expect(compositeSrgb(top, 0.5, under)).toEqual({ r: 100, g: 100, b: 100 });
    expect(compositeSrgb(top, 1, under)).toEqual(top);
    expect(compositeSrgb(top, 0, under)).toEqual(under);
    expect(compositeSrgb(top, 2, under)).toEqual(top);
  });
});

describe("proseInkLightness (#204 §7a — the author-picked ink clamp decision)", () => {
  const darkBase = { l: 0.158, c: 0.006, h: 60 };
  const lightBase = { l: 0.98, c: 0.004, h: 78 };

  test("returns null for a pairing that already clears AA — the byte-identical no-op arm", () => {
    // Birdie's real dialogue on her real base (~8.5:1): the sensible card does not move a pixel.
    expect(proseInkLightness({ l: 0.4, c: 0.1, h: 40 }, 1, lightBase)).toBeNull();
    // Hearth's own light inks on the dark base.
    expect(proseInkLightness({ l: 0.86, c: 0.1, h: 85 }, 1, darkBase)).toBeNull();
  });

  test("returns the derived pivot-flip lightness for a failing pairing (hue/chroma are the caller's)", () => {
    // Dark ink, dark base — the #204 divorce class: the dark base derives the light arm (fgLMax).
    expect(proseInkLightness({ l: 0.3, c: 0.1, h: 40 }, 1, darkBase)).toBe(THEME_DERIVATION.fgLMax);
    // Light ink, light base — the light base derives the dark arm (fgLMin).
    expect(proseInkLightness({ l: 0.9, c: 0.05, h: 60 }, 1, lightBase)).toBe(THEME_DERIVATION.fgLMin);
  });

  test("composites a translucent ink over the base before judging — alpha can fail an opaque-passing ink", () => {
    const ink = { l: 0.75, c: 0.05, h: 60 };
    expect(proseInkLightness(ink, 1, darkBase)).toBeNull();
    expect(proseInkLightness(ink, 0.35, darkBase)).toBe(THEME_DERIVATION.fgLMax);
  });
});

describe("readingPlateAlpha (#217 — the polarity-aware plate alpha)", () => {
  const darkBase = { l: 0.158, c: 0.006, h: 60 };
  const lightBase = { l: 0.98, c: 0.004, h: 78 };
  const Black = { r: 0, g: 0, b: 0 };
  const White = { r: 255, g: 255, b: 255 };
  const { alpha: floor, deltaL, inkReferenceRatio } = THEME_DERIVATION.readingPlate;
  /** The neutral grey sitting EXACTLY `ratio` from `base` — the reference ink the derivation protects,
   *  rebuilt here by bisection rather than by the module's closed form, so this is an independent
   *  measurement of the guarantee and not a re-run of the impl. Contrast is monotone in the channel in
   *  both directions (a light base's reference is darker, a dark base's lighter); the direction is
   *  measured rather than assumed. */
  function referenceInk(base: { l: number; c: number; h: number }, ratio: number): { r: number; g: number; b: number } {
    const baseRgb = oklchToSrgb(base);
    const grey = (channel: number): { r: number; g: number; b: number } => ({ r: channel, g: channel, b: channel });
    const increasing = wcagContrastRatio(grey(255), baseRgb) > wcagContrastRatio(grey(0), baseRgb);
    let lo = 0;
    let hi = 255;
    for (let i = 0; i < 48; i += 1) {
      const mid = (lo + hi) / 2;
      if (wcagContrastRatio(grey(mid), baseRgb) < ratio === increasing) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return grey((lo + hi) / 2);
  }

  test("a DARK base keeps the measured 0.65 floor — D144(d)'s sacred dark rooms do not move", () => {
    expect(readingPlateAlpha(darkBase)).toBe(floor);
    expect(readingPlateAlpha({ l: 0.15, c: 0.015, h: 250 })).toBe(floor);
    // The pivot itself is the DARK arm's ceiling (the same boundary `colorSchemeFor` uses).
    expect(readingPlateAlpha({ l: THEME_DERIVATION.fgPivotL, c: 0.01, h: 60 })).toBe(floor);
    expect(readingPlateAlpha({ l: THEME_DERIVATION.fgPivotL + 0.01, c: 0.01, h: 60 })).toBeGreaterThan(floor);
  });

  test("a LIGHT base is raised until the reference ink clears AA over the plate over BLACK art", () => {
    const alpha = readingPlateAlpha(lightBase);
    expect(alpha).toBeGreaterThan(floor);
    expect(alpha).toBeLessThanOrEqual(1);
    const plate = oklchToSrgb(rampSurface(lightBase, deltaL));
    const ink = referenceInk(lightBase, inkReferenceRatio);
    // The guarantee holds AT the derived alpha…
    expect(wcagContrastRatio(ink, compositeSrgb(plate, alpha, Black))).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    // …and is the MINIMUM: one 0.001 step down loses it (so the plate stays as much of a window as the
    // floor allows — this is what makes it a derivation rather than "make it nearly opaque").
    expect(wcagContrastRatio(ink, compositeSrgb(plate, alpha - 0.001, Black))).toBeLessThan(AA_NORMAL_RATIO);
    // The OTHER extreme is free for a light plate: white art only lightens the composite.
    expect(wcagContrastRatio(ink, compositeSrgb(plate, alpha, White))).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  });

  test("the LIVE #217 defect is closed: the failing light room's inks clear AA over worst-case art", () => {
    // The owner's room (rescore-chats-2026-08-18): base oklch(0.98 0.004 78), the light seed's own
    // narration/dialogue/speaker inks — measured 3.48–4.23:1 over the bright wallpaper at 0.65.
    const plate = oklchToSrgb(rampSurface(lightBase, deltaL));
    const composite = compositeSrgb(plate, readingPlateAlpha(lightBase), Black);
    for (const ink of [
      { l: 0.4, c: 0.1, h: 240 },
      { l: 0.42, c: 0.03, h: 60 },
      { l: 0.28, c: 0.015, h: 60 },
      { l: 0.5, c: 0.17, h: 50 },
    ]) {
      expect(wcagContrastRatio(oklchToSrgb(ink), composite)).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
  });

  test("#241 the BAND is the plate's own colour at alpha 1 — no second constant to drift", () => {
    for (const base of [darkBase, lightBase, { l: 0.25, c: 0.02, h: 300 }]) {
      const band = readingBandSurface(base);
      const plate = rampSurface(base, deltaL);
      expect(band).toEqual(plate);
      // The band composited on ANY art is itself (it is opaque) — the property that lets the sticky
      // attribution occlude (#168) while matching the plate the prose beneath it rides.
      for (const art of [Black, White]) {
        expect(compositeSrgb(oklchToSrgb(band), READING_BAND_ALPHA, art)).toEqual(oklchToSrgb(band));
      }
      // Non-vacuity for "no step": the ramp surface the band USED to take (card) is a different colour by
      // a visible margin — this is the ΔL the ruling deletes. It is 0.085 on a dark base (card +0.047)
      // and 0.053 on the light seed since #682 (card +0.015, no longer CLAMPED at 1.0 — pre-#682 the
      // clamp made this read 0.058). The owner's filed "ΔL ≈ 0.06" is that light-arm number, so the floor
      // asserted here is the smaller one either way.
      expect(Math.abs(rampSurface(base, rampDeltas(base).card).l - band.l)).toBeGreaterThan(0.05);
    }
  });
});
