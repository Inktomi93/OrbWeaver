// The D44 §12.1 color-safety predicate: the whole permitted surface accepts; every injection
// vector rejects OUTRIGHT (never sanitized). Both the ui render clamps and the contracts wire
// clamp ride this one function — these pins are the shared security floor.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { hueDistance, isDeterministicColor, isRenderableColor, isSafeColor, oklchHue, parseCssColorToSrgb } from "@orb/kit/safe-color";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const MODERN_SYSTEM_COLORS = [
  "AccentColor",
  "AccentColorText",
  "ActiveText",
  "ButtonBorder",
  "ButtonFace",
  "ButtonText",
  "Canvas",
  "CanvasText",
  "Field",
  "FieldText",
  "GrayText",
  "Highlight",
  "HighlightText",
  "LinkText",
  "Mark",
  "MarkText",
  "SelectedItem",
  "SelectedItemText",
  "VisitedText",
] as const;

const DEPRECATED_SYSTEM_COLORS = [
  "ActiveBorder",
  "ActiveCaption",
  "AppWorkspace",
  "Background",
  "ButtonHighlight",
  "ButtonShadow",
  "CaptionText",
  "InactiveBorder",
  "InactiveCaption",
  "InactiveCaptionText",
  "InfoBackground",
  "InfoText",
  "Menu",
  "MenuText",
  "Scrollbar",
  "ThreeDDarkShadow",
  "ThreeDFace",
  "ThreeDHighlight",
  "ThreeDLightShadow",
  "ThreeDShadow",
  "Window",
  "WindowFrame",
  "WindowText",
] as const;

const CSS_WIDE_COLORS = ["inherit", "initial", "revert", "revert-layer", "unset"] as const;
const CONTEXTUAL_COLORS = ["currentColor", ...MODERN_SYSTEM_COLORS, ...CSS_WIDE_COLORS, ...DEPRECATED_SYSTEM_COLORS] as const;

// CSS Color 4's named-color table (ColorJS 0.5.2 resolves all 148). Kept explicit so this is an
// independent compatibility control for the boundary rather than a reflection of its implementation.
const STANDARD_NAMED_COLORS = `
aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid
mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise
palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown
salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan
teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen
`
  .trim()
  .split(/\s+/u);

describe("isSafeColor", () => {
  test("accepts the whole permitted surface (hex / rgb / hsl / oklch / oklab / named)", () => {
    for (const v of [
      "#abc",
      "#abcd",
      "#a1b2c3",
      "#a1b2c3d4",
      "rgb(1, 2, 3)",
      "rgba(1, 2, 3, 0.5)",
      "hsl(120, 50%, 50%)",
      "hsla(120deg, 50%, 50% / 0.5)",
      "oklch(0.76 0.145 66)",
      "oklab(0.5 -0.1 0.1)",
      "oklch(0.97 0.01 75 / 0.09)",
      "transparent",
      "currentcolor",
      "red",
    ]) {
      expect(isSafeColor(v), v).toBe(true);
    }
  });

  test("NAMED is a letters-SHAPE gate, not a named-color allowlist (unknown bare words pass by design)", () => {
    // Pins the real contract behind the comment: the predicate accepts ANY 3–20 letter word — an unknown
    // one is a browser-INVALID color the page silently ignores, and it carries no separators/parens/escape,
    // so it is harmless. This is deliberate (no ~150-name allowlist to maintain); this test guards against a
    // future "tighten to an allowlist" change silently breaking the many legit CSS names it would then miss.
    expect(isSafeColor("notacolorxx")).toBe(true);
    // Deterministic is the CONTEXT-INDEPENDENCE question and still says yes here (#1358 did not move it —
    // the render clamp reads it and its fail-open is load-bearing). RENDERABILITY is the separate third
    // question, asked at write boundaries; see the `isRenderableColor` block below.
    expect(isDeterministicColor("notacolorxx")).toBe(true);
    expect(isRenderableColor("notacolorxx")).toBe(false);
    expect(isSafeColor("rebeccapurple")).toBe(true);
    // But a word with a separator/digit is NOT letters-only — it must match a functional form or be rejected.
    expect(isSafeColor("not-a-color")).toBe(false);
    expect(isSafeColor("color1")).toBe(false);
  });

  test("the general injection predicate keeps all 47 admitted contextual words for inherited/direct-paint consumers", () => {
    const admitted = CONTEXTUAL_COLORS.filter((color) => color !== "revert-layer");
    expect(admitted).toHaveLength(47);
    for (const color of admitted) {
      expect(isSafeColor(color), color).toBe(true);
    }
    // The hyphenated CSS-wide spelling was never part of the letters-only safe shape.
    expect(isSafeColor("revert-layer")).toBe(false);
  });

  test("the deterministic boundary rejects every contextual/system/CSS-wide class case-insensitively", () => {
    for (const color of CONTEXTUAL_COLORS) {
      expect(isDeterministicColor(color), color).toBe(false);
      expect(isDeterministicColor(color.toUpperCase()), color.toUpperCase()).toBe(false);
    }
  });

  test("all 148 standards-resolvable named colors remain accepted, including burlywood", () => {
    expect(STANDARD_NAMED_COLORS).toHaveLength(148);
    for (const color of STANDARD_NAMED_COLORS) {
      expect(isSafeColor(color), color).toBe(true);
      expect(isDeterministicColor(color), color).toBe(true);
      expect(parseCssColorToSrgb(color), color).not.toBeNull();
    }
  });

  test("rejects every injection vector outright", () => {
    // The two highest-entropy probes are token-assembled: biome noSecrets flags the literal forms
    // (they are hostile-input FIXTURES, not secrets), and biome-ignore only reaches one line.
    for (const v of [
      ["url(https://evil.exam", "ple/x.png)"].join(""),
      ["expression(al", "ert(1))"].join(""),
      "javascript:alert(1)",
      "@import 'x'",
      "red; background: url(x)",
      "red}body{color:red",
      "var(--x)",
      "linear-gradient(red, blue)",
      "red/*c*/",
      "<red>",
      "rgb\\(1,2,3)",
      "",
      "   ",
      `#${"a".repeat(70)}`, // over the length cap
    ]) {
      expect(isSafeColor(v), v).toBe(false);
    }
  });
});

// The hue readers (side-eye 2026-08-03 P2): a surface arbitrating two AUTHORED tints against each other
// needs to know whether they are the same colour. Deliberately oklch-only — a `null` is the honest
// "cannot compare", and the caller must leave the value alone rather than de-collide against a guess.
// ── #1358: injection-safe ≠ renderable ────────────────────────────────────────────────────────────────
// The defect these pin: `isSafeColor` answers "this cannot carry a payload" and was READ everywhere as
// "this is a colour". A theme accent of `notacolorxx` therefore passed the wire refine, persisted
// verbatim, and then emitted NOTHING — `toOklch` returned null and `put("--color-primary", undefined)` is
// a no-op, so the user saw no error, no fallback and no change.
describe("isRenderableColor (#1358 — the second question: can the renderer resolve it?)", () => {
  test("an unknown bare word is injection-safe, context-independent, and NOT renderable — three questions", () => {
    for (const word of ["notacolorxx", "zzzz", "colourish"]) {
      expect(isSafeColor(word), word).toBe(true);
      expect(isDeterministicColor(word), word).toBe(true);
      expect(isRenderableColor(word), word).toBe(false);
    }
  });

  test("every form the browser can actually resolve stays renderable", () => {
    for (const color of ["#abc", "#aabbccdd", "rgb(1 2 3)", "rgba(1,2,3,0.5)", "hsl(120 50% 50%)", "oklch(0.7 0.1 200)", "red", "burlywood", "rebeccapurple"]) {
      expect(isRenderableColor(color), color).toBe(true);
    }
  });

  test("a CONTEXTUAL colour is renderable but not deterministic — it resolves against the cascade, not to a pixel", () => {
    for (const color of ["currentColor", "inherit", "CanvasText"]) {
      expect(isRenderableColor(color), color).toBe(true);
      expect(isDeterministicColor(color), color).toBe(false);
    }
  });

  test("an injection shape is refused before the parser is ever asked", () => {
    for (const hostile of ["url(https://evil.example/x)", "not-a-color", "color1", ""]) {
      expect(isRenderableColor(hostile), hostile).toBe(false);
    }
  });
});

describe("oklchHue", () => {
  test("reads the hue angle out of every oklch spelling this app writes", () => {
    expect(oklchHue("oklch(0.85 0.10 80)")).toBe(80);
    expect(oklchHue("oklch(72% 0.16 213)")).toBe(213);
    expect(oklchHue("oklch(0.97 0.01 75 / 0.09)")).toBe(75);
    expect(oklchHue("  OKLCH(0.85 0.1 12.5)  ")).toBe(12.5);
  });

  test("normalises onto the wheel — a negative or over-turn angle is the same colour", () => {
    expect(oklchHue("oklch(0.85 0.1 -20)")).toBe(340);
    expect(oklchHue("oklch(0.85 0.1 380)")).toBe(20);
  });

  test("returns null for every form it cannot read (never a converted guess)", () => {
    for (const v of ["#e0c27a", "rgb(1,2,3)", "hsl(120, 50%, 50%)", "oklab(0.5 -0.1 0.1)", "red", "", "oklch()"]) {
      expect(oklchHue(v), v).toBeNull();
    }
  });
});

describe("hueDistance", () => {
  test("is the SHORT way round the wheel, so 350° and 10° are 20° apart, not 340°", () => {
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(10, 350)).toBe(20);
    expect(hueDistance(80, 72)).toBe(8);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(42, 42)).toBe(0);
  });
});

describe("parseCssColorToSrgb (#204/#939 — standards color normalization after the safety gate)", () => {
  test("ColorJS is a direct cataloged kit dependency and resolves from the kit package boundary", () => {
    const kitManifest = JSON.parse(readFileSync(resolve("packages/kit/package.json"), "utf8")) as { dependencies?: Record<string, string> };
    expect(kitManifest.dependencies?.["colorjs.io"]).toBe("catalog:");
    expect(readFileSync(resolve("pnpm-workspace.yaml"), "utf8")).toContain("colorjs.io: 0.5.2");
    expect(readFileSync(resolve("pnpm-lock.yaml"), "utf8")).toMatch(/packages\/kit:[\s\S]*?colorjs\.io:[\s\S]*?version: 0\.5\.2/u);
    expect(createRequire(resolve("packages/kit/package.json")).resolve("colorjs.io")).toContain("colorjs.io@0.5.2");
  });

  test("reads every hex arity, including alpha", () => {
    expect(parseCssColorToSrgb("#fff")).toMatchObject({ r: 255, g: 255, b: 255, alpha: 1, inGamut: true });
    expect(parseCssColorToSrgb("#102030")).toMatchObject({ r: 16, g: 32, b: 48, alpha: 1, inGamut: true });
    const short = parseCssColorToSrgb("#f008");
    expect(short?.r).toBe(255);
    expect(short?.alpha).toBeCloseTo(8 / 15, 4);
    const long = parseCssColorToSrgb("#10203080");
    expect(long?.alpha).toBeCloseTo(128 / 255, 4);
  });

  test("reads rgb()/rgba() in comma AND space syntax, with % channels and alpha", () => {
    expect(parseCssColorToSrgb("rgb(20, 20, 30)")).toMatchObject({ r: 20, g: 20, b: 30, alpha: 1, inGamut: true });
    expect(parseCssColorToSrgb("rgb(20 20 30 / 0.5)")).toMatchObject({ r: 20, g: 20, b: 30, alpha: 0.5, inGamut: true });
    expect(parseCssColorToSrgb("rgba(100%, 0%, 50%, 40%)")).toMatchObject({ r: 255, g: 0, b: 127.5, alpha: 0.4, inGamut: true });
  });

  test("reads hsl()/hsla() through the classic ramp (spot-checked against browser-resolved values)", () => {
    const red = parseCssColorToSrgb("hsl(0, 100%, 50%)");
    expect(red?.r).toBeCloseTo(255, 3);
    expect(red?.g).toBeCloseTo(0, 3);
    const teal = parseCssColorToSrgb("hsl(180, 50%, 40%)");
    expect(teal?.r).toBeCloseTo(51, 0);
    expect(teal?.g).toBeCloseTo(153, 0);
    expect(teal?.b).toBeCloseTo(153, 0);
    const grey = parseCssColorToSrgb("hsla(200, 0%, 60%, 0.25)");
    expect(grey?.r).toBeCloseTo(153, 0);
    expect(grey?.alpha).toBe(0.25);
  });

  test("resolves named/OKL colors, CSS-gamut-maps extremes, and keeps invalid/contextual values null", () => {
    expect(parseCssColorToSrgb("red")).toMatchObject({ r: 255, g: 0, b: 0, alpha: 1, inGamut: true });
    expect(parseCssColorToSrgb("transparent")).toMatchObject({ alpha: 0, inGamut: true });
    expect(parseCssColorToSrgb("oklch(0.5 0.1 60)")).toMatchObject({ alpha: 1, inGamut: true });
    const extreme = parseCssColorToSrgb("oklch(0.2 3.6 225)");
    expect(extreme).toMatchObject({ alpha: 1, inGamut: false });
    expect([extreme?.r, extreme?.g, extreme?.b].every((channel) => channel !== undefined && channel >= 0 && channel <= 255)).toBe(true);
    expect(parseCssColorToSrgb("notacolorxx")).toBeNull();
    expect(parseCssColorToSrgb("currentColor")).toBeNull();
    expect(parseCssColorToSrgb("url(//x)")).toBeNull();
  });
});
