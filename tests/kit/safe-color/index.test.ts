import { isDeterministicColor, isRenderableColor, isSafeColor, parseCssColorToSrgb } from "@orb/kit/safe-color";
import { expect, test } from "@orb/testkit/node";

test.each([
  ["#123", [17, 34, 51, 1]],
  ["#1238", [17, 34, 51, 8 / 15]],
  ["#102030", [16, 32, 48, 1]],
  ["#10203080", [16, 32, 48, 128 / 255]],
  ["rgb(20, 40, 60)", [20, 40, 60, 1]],
  ["rgb(20 40 60 / 50%)", [20, 40, 60, 0.5]],
  ["rgba(100%, 0%, 50%, 40%)", [255, 0, 127.5, 0.4]],
  ["hsl(180 100% 50%)", [0, 255, 255, 1]],
  ["hsla(200, 0%, 60%, 0.25)", [153, 153, 153, 0.25]],
  ["red", [255, 0, 0, 1]],
  ["burlywood", [222, 184, 135, 1]],
  ["transparent", [0, 0, 0, 0]],
] as const)("resolves %s to finite sRGB channels and straight alpha", (raw, [r, g, b, alpha]) => {
  const parsed = parseCssColorToSrgb(raw);
  expect(parsed?.r).toBeCloseTo(r, 6);
  expect(parsed?.g).toBeCloseTo(g, 6);
  expect(parsed?.b).toBeCloseTo(b, 6);
  expect(parsed?.alpha).toBeCloseTo(alpha, 6);
  expect(parsed?.inGamut).toBe(true);
  expect(isRenderableColor(raw)).toBe(true);
});

test.each(["oklch(0.7 0.19 40 / 0.55)", "oklab(0.7 0.145548 0.12213 / 0.55)"])("preserves OKL alpha and converted channels for %s", (raw) => {
  const parsed = parseCssColorToSrgb(raw);
  expect(parsed?.r).toBeCloseTo(252.006, 2);
  expect(parsed?.g).toBeCloseTo(107.076, 2);
  expect(parsed?.b).toBeCloseTo(50.926, 2);
  expect(parsed?.alpha).toBe(0.55);
  expect(parsed?.inGamut).toBe(true);
});

test("CSS gamut mapping preserves alpha and the authored out-of-gamut fact", () => {
  const extreme = parseCssColorToSrgb("oklch(0.2 3.6 225 / 0.4)");
  expect(extreme).toMatchObject({ alpha: 0.4, inGamut: false });
  for (const channel of [extreme?.r, extreme?.g, extreme?.b]) {
    expect(channel).toBeGreaterThanOrEqual(0);
    expect(channel).toBeLessThanOrEqual(255);
  }
  const white = parseCssColorToSrgb("oklch(2 1 30 / 0.5)");
  expect(white?.r).toBeCloseTo(255, 6);
  expect(white?.g).toBeCloseTo(255, 6);
  expect(white?.b).toBeCloseTo(255, 6);
  expect(white).toMatchObject({ alpha: 0.5, inGamut: false });
  expect(parseCssColorToSrgb("oklch(-1 1 30 / 0.5)")).toEqual({ r: 0, g: 0, b: 0, alpha: 0.5, inGamut: false });
});

test("safe shapes do not coerce malformed numeric channels into a color", () => {
  expect(parseCssColorToSrgb("rgb(1 2 3)")).toMatchObject({ r: 1, g: 2, b: 3 });
  for (const raw of ["rgb(1..2 0 0)", "oklch(. . .)", "rgb(1 2)", "rgba(1, 2, 3, .)", "notacolorxx"]) {
    expect(isSafeColor(raw), raw).toBe(true);
    expect(parseCssColorToSrgb(raw), raw).toBeNull();
    expect(isRenderableColor(raw), raw).toBe(false);
  }
  expect(isDeterministicColor("notacolorxx")).toBe(true);
});

test.each(["currentColor", "CanvasText", "inherit", "unset"])("keeps contextual %s separate from an authored pixel", (raw) => {
  expect(isSafeColor(raw)).toBe(true);
  expect(isRenderableColor(raw)).toBe(true);
  expect(isDeterministicColor(raw)).toBe(false);
  expect(parseCssColorToSrgb(raw)).toBeNull();
});

test("a broader upstream parser cannot bypass the CSS-write safety gate", () => {
  expect(parseCssColorToSrgb("oklch(0.7 0.1 40)")).not.toBeNull();
  for (const raw of [
    "url(/image)",
    "expression(1)",
    "var(--color)",
    "red; color: blue",
    "red}body{color:blue",
    "red/*comment*/",
    "rgb\\(1 2 3)",
    "hwb(180 0% 0%)",
    "color(srgb 1 0 0)",
    "rgb(none 0 0)",
    "rgb(1 2 3 / none)",
    "oklch(from red l c h)",
    `rgb(${" ".repeat(200_000)}`,
  ]) {
    expect(isSafeColor(raw), raw).toBe(false);
    expect(isRenderableColor(raw), raw).toBe(false);
    expect(parseCssColorToSrgb(raw), raw).toBeNull();
  }
});
