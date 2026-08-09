// Mirror test for domain/import/substrate/color — the ST→orb colour conversion the theme plane rests on.
// Pins the three things a wrong answer here would silently corrupt every imported palette with: the sRGB
// parse surface (ST writes `rgba()`; a hand-edited theme may write hex), the alpha FLATTENING (ST tints are
// layered over a backdrop and orb's base surface must be opaque), and the sRGB→OKLCH transform against
// PUBLISHED reference values (a transposed matrix coefficient produces plausible-looking wrong colours).

import { describe } from "vitest";
import { compositeOver, oklchLiteral, opaque, parseSrgb, toOklch } from "../../../../../packages/server/src/domain/import/substrate/color.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The literal for a colour string, or null when it does not parse — the whole pipeline in one call. */
function convert(raw: string): string | null {
  const parsed = parseSrgb(raw);
  return parsed === null ? null : oklchLiteral(toOklch(opaque(parsed)));
}

describe("parseSrgb", () => {
  test("reads every form ST or a hand-edited theme file can write", () => {
    expect(parseSrgb("rgba(23, 30, 33, 0.61)")).toEqual({ r: 23, g: 30, b: 33, a: 0.61 });
    // No alpha component ⇒ opaque.
    expect(parseSrgb("rgb(23,30,33)")).toEqual({ r: 23, g: 30, b: 33, a: 1 });
    // Modern space/slash syntax.
    expect(parseSrgb("rgb(23 30 33 / 0.5)")).toEqual({ r: 23, g: 30, b: 33, a: 0.5 });
    expect(parseSrgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseSrgb("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    // 8-digit hex carries alpha; #80 is 128/255.
    expect(parseSrgb("#ff000080")?.a).toBeCloseTo(128 / 255, 5);
  });

  test("returns null (never a guess) for a form it cannot read", () => {
    // The caller REPORTS these rather than inventing a colour — an oklch/named/var value is not ST's output.
    expect(parseSrgb("oklch(0.5 0.1 20)")).toBeNull();
    expect(parseSrgb("red")).toBeNull();
    expect(parseSrgb("var(--x)")).toBeNull();
    expect(parseSrgb("")).toBeNull();
    expect(parseSrgb("rgb(1,2)")).toBeNull();
  });
});

describe("compositeOver / opaque", () => {
  test("source-over composite always yields an opaque result", () => {
    const fg = { r: 0, g: 0, b: 255, a: 0.5 };
    const bg = { r: 0, g: 0, b: 0, a: 1 };
    // 50% blue over black is half-intensity blue, and opaque — so a tint chain stays well defined.
    expect(compositeOver(fg, bg)).toEqual({ r: 0, g: 0, b: 127.5, a: 1 });
  });

  test("opaque() DROPS alpha rather than compositing — the base-surface rule", () => {
    // ST's base tint sits over an unknowable background photo, so the honest reading is the colour itself.
    expect(opaque({ r: 23, g: 30, b: 33, a: 0.61 })).toEqual({ r: 23, g: 30, b: 33, a: 1 });
  });
});

describe("toOklch", () => {
  test("matches the published sRGB→OKLCH reference values", () => {
    // These are the canonical primaries from Ottosson's own writeup; a transposed coefficient breaks them.
    expect(convert("rgb(255,0,0)")).toBe("oklch(0.6280 0.2577 29.23)");
    expect(convert("rgb(0,255,0)")).toBe("oklch(0.8664 0.2948 142.50)");
    expect(convert("rgb(0,0,255)")).toBe("oklch(0.4520 0.3132 264.05)");
    expect(convert("rgb(0,0,0)")).toBe("oklch(0.0000 0.0000 0.00)");
  });

  test("a NEUTRAL pins hue to 0 instead of emitting float noise", () => {
    // Pure white's raw hue lands near 89.88° purely from floating-point residue at chroma 0. Two greys that
    // render identically must not read as different hues to the near-duplicate / hue-distance lenses.
    expect(convert("rgb(255,255,255)")).toBe("oklch(1.0000 0.0000 0.00)");
    expect(convert("rgb(23,23,23)")).toBe("oklch(0.2046 0.0000 0.00)");
  });

  test("is deterministic — the same ST bytes always yield the same literal", () => {
    // The whole-profile import is idempotent, which requires byte-identical palettes on a re-run.
    expect(convert("rgba(171, 198, 223, 1)")).toBe(convert("rgba(171, 198, 223, 1)"));
    expect(convert("rgba(171, 198, 223, 1)")).toBe("oklch(0.8147 0.0459 246.33)");
  });
});
