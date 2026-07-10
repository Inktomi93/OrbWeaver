// The D44 §12.1 color-safety predicate: the whole permitted surface accepts; every injection
// vector rejects OUTRIGHT (never sanitized). Both the ui render clamps and the contracts wire
// clamp ride this one function — these pins are the shared security floor.

import { isSafeColor } from "@orb/kit/safe-color";
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
