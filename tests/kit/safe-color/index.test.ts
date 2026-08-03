// The D44 §12.1 color-safety predicate: the whole permitted surface accepts; every injection
// vector rejects OUTRIGHT (never sanitized). Both the ui render clamps and the contracts wire
// clamp ride this one function — these pins are the shared security floor.

import { hueDistance, isSafeColor, oklchHue } from "@orb/kit/safe-color";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

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
    expect(isSafeColor("rebeccapurple")).toBe(true);
    // But a word with a separator/digit is NOT letters-only — it must match a functional form or be rejected.
    expect(isSafeColor("not-a-color")).toBe(false);
    expect(isSafeColor("color1")).toBe(false);
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
