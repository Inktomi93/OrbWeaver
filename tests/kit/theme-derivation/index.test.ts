// Mirror test for kit/theme-derivation — the D71 derivation numbers + the node-side prediction of them.
//
// The point of this module is that TWO packages that cannot see each other must agree about one derivation:
// `@orb/ui`'s clamp emits the CSS a browser evaluates, and `@orb/server` imports foreign palettes into the
// same total contract. So the tests pin (1) that the ui clamp really reads these numbers rather than carrying
// its own copy — the whole reason they moved down the cake — and
// (2) that every accepted base produces semantic surface/foreground pairs that clear the text floor.

import {
  AA_LARGE_RATIO,
  AA_NORMAL_RATIO,
  accentFillLightness,
  chartRampForSurface,
  compositeSrgb,
  derivedForeground,
  derivedForegroundLightness,
  derivedForegroundLightnessForSurfaces,
  derivedMutedForegroundLightness,
  inputCompositeSurface,
  oklabToOklch,
  oklchToSrgb,
  proseInkLightness,
  READING_BAND_ALPHA,
  rampDeltas,
  rampSurface,
  readingBandSurface,
  readingPlateAlpha,
  readingPlateForeground,
  shadowIngredients,
  srgbToOklch,
  surfacePolarity,
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

  test("the elevation arm rides the measured surface polarity", () => {
    expect(shadowIngredients({ l: 0.55, c: 0.01, h: 60 }).highlight.alpha).toBe(THEME_DERIVATION.shadow.dark.highlight.alpha);
    expect(shadowIngredients({ l: 0.57, c: 0.01, h: 60 }).highlight.alpha).toBe(THEME_DERIVATION.shadow.light.highlight.alpha);
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

  test("the ramp arm rides measured polarity, retracting only a shared-host delta that crosses it", () => {
    const dark = rampDeltas({ l: 0.55, c: 0.01, h: 60 });
    const light = rampDeltas({ l: 0.57, c: 0.01, h: 60 });
    expect(surfacePolarity({ l: 0.55, c: 0.01, h: 60 })).toBe("dark");
    expect(surfacePolarity({ l: 0.57, c: 0.01, h: 60 })).toBe("light");
    expect(dark.sidebar).toBe(THEME_DERIVATION.ramp.dark.sidebar);
    expect(dark.card).toBeLessThan(THEME_DERIVATION.ramp.dark.card);
    expect(light.card).toBe(THEME_DERIVATION.ramp.light.card);
    expect(light.sidebar).toBeGreaterThan(THEME_DERIVATION.ramp.light.sidebar);
    // Dedicated foreground roles remove any reason to project these authored hover-surface deltas.
    expect(dark.accent).toBe(THEME_DERIVATION.ramp.dark.accent);
    expect(light.sidebarAccent).toBe(THEME_DERIVATION.ramp.light.sidebarAccent);
  });
});

describe("chartRampForSurface (#939 — custom categorical fills)", () => {
  test("a clearing dark room keeps the shipped ramp byte-for-byte", () => {
    expect(chartRampForSurface({ l: 0.158, c: 0.006, h: 60 })).toEqual([
      { l: 0.72, c: 0.175, h: 52 },
      { l: 0.7, c: 0.1, h: 200 },
      { l: 0.68, c: 0.12, h: 300 },
      { l: 0.74, c: 0.11, h: 130 },
      { l: 0.7, c: 0.12, h: 35 },
    ]);
  });

  test.each([0.62, 0.6201, 0.63] as const)("L=%s derives one concrete five-color family instead of trusting a failing static arm", (l) => {
    const base = { l, c: 0.01, h: 60 };
    const surfaces = [
      base,
      rampSurface(base, rampDeltas(base).card),
      rampSurface(base, rampDeltas(base).surfaceRaised),
      rampSurface(base, rampDeltas(base).sidebar),
    ];
    const ramp = chartRampForSurface(base);
    expect(ramp).toHaveLength(5);
    for (const fill of ramp) {
      for (const surface of surfaces) {
        expect(wcagContrastRatio(oklchToSrgb(fill), oklchToSrgb(surface))).toBeGreaterThanOrEqual(AA_LARGE_RATIO);
      }
    }
  });
});

describe("derivedForegroundLightness", () => {
  test("preserves the shipped endpoints where they clear and solves the legal pivot bases", () => {
    expect(derivedForegroundLightness({ l: 0.15, c: 0.015, h: 250 })).toBe(THEME_DERIVATION.fgLMax);
    expect(derivedForegroundLightness({ l: 0.95, c: 0.01, h: 60 })).toBe(THEME_DERIVATION.fgLMin);
    for (const l of [0.62, 0.6201]) {
      const surface = { l, c: 0.01, h: 60 };
      const ink = { l: derivedForegroundLightness(surface), c: 0, h: surface.h };
      expect(wcagContrastRatio(oklchToSrgb(ink), oklchToSrgb(surface)), `pivot L=${l}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
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

describe("#969 accepted-base foreground contract", () => {
  test.each([0.62, 0.6201] as const)("L=%s derives each semantic ink against the surface it paints", (l) => {
    const base = { l, c: 0.01, h: 60 };
    const deltas = rampDeltas(base);
    const raised = rampSurface(base, deltas.surfaceRaised);
    const card = rampSurface(base, deltas.card);
    const popover = rampSurface(base, deltas.popover);
    const sidebar = rampSurface(base, deltas.sidebar);
    const sidebarAccent = rampSurface(base, deltas.sidebarAccent);
    const secondary = rampSurface(base, deltas.secondary);
    const muted = rampSurface(base, deltas.muted);
    const pairs = [
      [{ l: derivedForegroundLightnessForSurfaces([base, raised, card]), c: 0, h: base.h }, base, "foreground/background"],
      [derivedForeground(card), card, "card-foreground/card"],
      [derivedForeground(popover), popover, "popover-foreground/popover"],
      [derivedForeground(sidebar), sidebar, "sidebar-foreground/sidebar"],
      [derivedForeground(sidebarAccent), sidebarAccent, "sidebar-accent-foreground/sidebar-accent"],
      [derivedForeground(secondary), secondary, "secondary-foreground/secondary"],
      [
        {
          l: derivedMutedForegroundLightness([
            base,
            card,
            popover,
            sidebar,
            secondary,
            muted,
            inputCompositeSurface(base, base),
            inputCompositeSurface(base, card),
            inputCompositeSurface(base, popover),
          ]),
          c: 0,
          h: base.h,
        },
        muted,
        "muted-foreground/muted",
      ],
    ] as const;
    for (const [ink, surface, label] of pairs) {
      expect(wcagContrastRatio(oklchToSrgb(ink), oklchToSrgb(surface)), label).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
    const mutedInk = pairs.at(-1)?.[0];
    if (mutedInk === undefined) {
      throw new Error("muted foreground pair missing");
    }
    for (const [surface, label] of [
      [inputCompositeSurface(base, base), "input/background"],
      [inputCompositeSurface(base, card), "input/card"],
      [inputCompositeSurface(base, popover), "input/popover"],
    ] as const) {
      expect(wcagContrastRatio(oklchToSrgb(mutedInk), oklchToSrgb(surface)), label).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
    expect(surfacePolarity(base)).toBe("light");
  });

  test("the old shared muted endpoint is a planted failing control at both pivot fixtures", () => {
    const failures = [0.62, 0.6201].filter((l) => {
      const base = { l, c: 0.01, h: 60 };
      return (
        wcagContrastRatio(oklchToSrgb({ l: THEME_DERIVATION.mutedLMin, c: 0, h: 60 }), oklchToSrgb(rampSurface(base, rampDeltas(base).card))) < AA_NORMAL_RATIO
      );
    });
    expect(failures).toHaveLength(2);
  });

  test.each([0.62, 0.6201] as const)("L=%s derives a plate pair that clears black and white art", (l) => {
    const base = { l, c: 0.01, h: 60 };
    const plate = oklchToSrgb(rampSurface(base, THEME_DERIVATION.readingPlate.deltaL));
    const ink = oklchToSrgb(readingPlateForeground(base));
    const alpha = readingPlateAlpha(base);
    for (const art of [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ]) {
      expect(wcagContrastRatio(ink, compositeSrgb(plate, alpha, art))).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
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

describe("accentFillLightness (#692 — the accent judged against the card its graphics land on)", () => {
  const darkBase = { l: 0.158, c: 0.006, h: 60 };
  const lightBase = { l: 0.98, c: 0.004, h: 75 };
  const hearthAccent = { l: 0.72, c: 0.175, h: 52 };
  const lightSeedAccent = { l: 0.55, c: 0.16, h: 50 };
  const cardOf = (base: { l: number; c: number; h: number }): { l: number; c: number; h: number } => rampSurface(base, rampDeltas(base).card);
  const vsCard = (accent: { l: number; c: number; h: number }, base: { l: number; c: number; h: number }): number =>
    wcagContrastRatio(oklchToSrgb(accent), oklchToSrgb(cardOf(base)));

  test("THE DEFECT: Hearth's accent inherited into a near-white carried room fails 1.4.11, and the fix clears it", () => {
    // The filed number, re-derived: 2.5858:1 — the arc meter's VALUE arc under a light carried palette.
    expect(vsCard(hearthAccent, lightBase)).toBeCloseTo(2.5858, 3);
    const l = accentFillLightness(hearthAccent, 1, lightBase);
    expect(l).not.toBeNull();
    // Hue and chroma are the author's; only L moved, and only as far as the floor needed (0.72 -> 0.68).
    expect(vsCard({ l: l ?? 0, c: hearthAccent.c, h: hearthAccent.h }, lightBase)).toBeGreaterThanOrEqual(AA_LARGE_RATIO);
    expect(l ?? 0).toBeLessThan(hearthAccent.l);
    expect(l ?? 0).toBeGreaterThan(hearthAccent.l - 0.1);
  });

  test("BYTE-IDENTICAL PASS-THROUGH: an accent that already clears returns null on either polarity", () => {
    // The shipped Light seed's own primary on a light base — 5.07:1, nothing to fix (there was never a
    // seed to promote here; the defect is the cross-polarity INHERITANCE, not the light arm).
    expect(vsCard(lightSeedAccent, lightBase)).toBeGreaterThan(AA_LARGE_RATIO);
    expect(accentFillLightness(lightSeedAccent, 1, lightBase)).toBeNull();
    // The dark arm does not move: Hearth's accent in a Hearth room is 6.83:1.
    expect(accentFillLightness(hearthAccent, 1, darkBase)).toBeNull();
  });

  test("the direction is the PIVOT's — a light card darkens the accent, a dark card lightens it", () => {
    const pale = { l: 0.92, c: 0.05, h: 200 };
    expect(accentFillLightness(pale, 1, { l: 0.96, c: 0.004, h: 75 }) ?? 1).toBeLessThan(pale.l);
    const murky = { l: 0.2, c: 0.05, h: 200 };
    expect(accentFillLightness(murky, 1, darkBase) ?? 0).toBeGreaterThan(murky.l);
  });

  test("a translucent accent is composited over the card before judging — alpha can fail an opaque-passing pick", () => {
    // Opaque it clears the dark room; at 0.2 over that card it does not, and the correction is a real move.
    expect(accentFillLightness(hearthAccent, 1, darkBase)).toBeNull();
    const corrected = accentFillLightness(hearthAccent, 0.2, darkBase);
    expect(corrected).not.toBeNull();
    expect(corrected ?? 0).toBeGreaterThan(hearthAccent.l);
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
    expect(readingPlateAlpha({ l: 0.62, c: 0.01, h: 60 })).toBeGreaterThan(floor);
    expect(readingPlateAlpha({ l: 0.6201, c: 0.01, h: 60 })).toBeGreaterThan(floor);
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
