import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { compositedBase, toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";

test("theme derivation receives converted OKL channels with authored alpha and gamut status", () => {
  const parsed = toOklch("oklch(0.7 0.19 40 / 0.55)");
  expect(parsed?.l).toBeCloseTo(0.7, 6);
  expect(parsed?.c).toBeCloseTo(0.19, 6);
  expect(parsed?.h).toBeCloseTo(40, 4);
  expect(parsed).toMatchObject({ alpha: 0.55, inGamut: true });
  expect(toOklch("oklch(0.2 3.6 225)")).toMatchObject({ alpha: 1, inGamut: false });
});

test("transparent and unreadable carried fills derive from the real ambient surface", () => {
  const ambient = "#102030";
  const resolved = toOklch(ambient);
  expect(resolved).not.toBeNull();
  expect(compositedBase("transparent", ambient)?.l).toBeCloseTo(resolved?.l ?? 0, 6);
  expect(compositedBase("notacolorxx", ambient)).toEqual(resolved);
  expect(compositedBase("currentColor", ambient)).toEqual(resolved);
  expect(compositedBase("rgba(20, 40, 60, 0.5)", undefined)).toBeNull();
});
