// THE PERMANENT PIN for a tool caught LYING (.claude/rules/verify-and-gates.md): three shipped
// rules — `glow-shadow`, `radial-halo`, `radial-spotlight-glow` — were structurally DEAD, because
// `checks-decor.ts` and `checks-ornament.ts` each carried a hand-rolled `rgba?\(…\)`-and-hex regex
// while our tokens are OKLCH-only and raw colours are gate-RED at source. They could only ever fire
// on a value another gate already blocks.
//
// Every case here is a TWO-DIRECTION control: the same defect authored in rgba() and in oklch(), plus
// the negatives that must stay silent (the sanctioned carriers, our own --shadow-overlay recipe, an
// unresolved var()). A regression to any colour-space-blind parser turns the oklch rows red.

import { describe } from "vitest";
import type { Finding } from "../../../../tooling/src/ui-audit/contract/findings.ts";
import { checkGlowShadow } from "../../../../tooling/src/ui-audit/lib/checks-decor.ts";
import { checkRadialGlow } from "../../../../tooling/src/ui-audit/lib/checks-ornament.ts";
import { findColorToken, parseCssColor } from "../../../../tooling/src/ui-audit/lib/css-color.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DARK = { r: 20, g: 18, b: 16, a: 1 } as const;

function glow(boxShadow: string): Finding | null {
  return checkGlowShadow({ selector: "x", boxShadow, textShadow: "", backdropColor: DARK });
}

function radial(value: string, sanctioned = false): Finding | null {
  return checkRadialGlow({ selector: "y", value, width: 600, height: 400, sanctioned });
}

describe("css-color — the one colour reader", () => {
  test("reads every colour space computed style can hand back", () => {
    expect(parseCssColor("oklch(0.7 0.19 40 / 0.55)")?.a).toBeCloseTo(0.55, 5);
    expect(parseCssColor("oklab(0.7 0.145 0.122 / 0.5)")?.a).toBeCloseTo(0.5, 5);
    expect(parseCssColor("rgba(255,90,40,0.55)")?.a).toBeCloseTo(0.55, 5);
    expect(parseCssColor("#ff5a28")).not.toBeNull();
  });

  test("REFUSES rather than guessing when the value is not a resolved colour", () => {
    // An unresolved var() and an authored relative form are what a caller must decline on, never
    // score against a fabricated channel.
    expect(parseCssColor("var(--color-shadow-hairline)")).toBeNull();
    expect(parseCssColor("oklch(from var(--color-primary) l c h / 0.4)")).toBeNull();
    expect(parseCssColor("none")).toBeNull();
  });

  test("does not let a non-colour word shadow the real colour in a shadow layer", () => {
    // `inset` is a bare letter-word and would match a naive named-colour scan first.
    expect(findColorToken("inset 0 1px 0 0 oklch(1 0 0 / 0.06)")?.raw).toBe("oklch(1 0 0 / 0.06)");
  });

  test("carries alpha at the fidelity our border token needs", () => {
    // --color-border is oklch(0.99 0.005 60 / 0.08); an alpha rounded away changes verdicts.
    expect(parseCssColor("oklch(0.99 0.005 60 / 0.08)")?.a).toBeCloseTo(0.08, 5);
  });
});

describe("glow-shadow sees every authorable colour space (was rgb-only, hence dead)", () => {
  test.each([
    ["rgba", "rgba(255,90,40,0.55) 0px 0px 18px 0px"],
    ["oklch", "oklch(0.7 0.19 40 / 0.55) 0px 0px 18px 0px"],
    ["oklab", "oklab(0.7 0.145 0.122 / 0.55) 0px 0px 18px 0px"],
    ["hex", "#ff5a28 0px 0px 18px 0px"],
  ])("fires on a zero-offset chromatic halo authored in %s", (_space, shadow) => {
    expect(glow(shadow)?.rule).toBe("glow-shadow");
  });

  test("stays silent on an achromatic elevation shadow", () => {
    expect(glow("oklch(0 0 0 / 0.45) 0px 0px 18px 0px")).toBeNull();
  });

  test("stays silent on our own --shadow-overlay recipe", () => {
    // The sanctioned 4-layer float: hairline ring + inset highlight + contact + ambient, all neutral.
    // If this ever fires, every menu/popover/tooltip/toast/drawer in the app becomes a finding.
    const overlay = [
      "oklch(1 0 0 / 0.06) 0px 0px 0px 1px",
      "oklch(1 0 0 / 0.06) 0px 1px 0px 0px inset",
      "oklch(0 0 0 / 0.3) 0px 2px 4px 0px",
      "oklch(0 0 0 / 0.45) 0px 12px 32px 0px",
    ].join(", ");
    expect(glow(overlay)).toBeNull();
  });

  test("refuses an unresolved var() instead of scoring it", () => {
    expect(glow("var(--shadow-glow) 0px 0px 18px 0px")).toBeNull();
  });

  test("a SANCTIONED carrier is exempt — the flag is the mechanism, never colour blindness", () => {
    // The first live run after the colour repair flagged [data-slot=media-grid-cell], which
    // SANCTIONED_GLOW_SEL has listed all along; the glow census simply never consulted it. Both
    // directions, so the exemption cannot quietly become a blanket.
    const halo = "oklch(0.72 0.175 52 / 0.4) 0px 0px 18px 0px";
    const carrier = { selector: "[data-slot=media-grid-cell]", boxShadow: halo, textShadow: "", backdropColor: DARK, sanctioned: true };
    expect(checkGlowShadow(carrier)).toBeNull();
    expect(checkGlowShadow({ ...carrier, sanctioned: false })?.rule).toBe("glow-shadow");
  });

  test("an absent sanctioned flag keeps a pre-2026-09-01 fixture's verdict", () => {
    // Optional on the contract: omitting it must read as "not exempt", never as "exempt".
    expect(glow("oklch(0.72 0.175 52 / 0.4) 0px 0px 18px 0px")?.rule).toBe("glow-shadow");
  });
});

describe("radial washes see every authorable colour space (was rgb/hex-only, hence dead)", () => {
  test.each([
    ["rgba", "radial-gradient(circle, rgba(255,90,40,0.6) 0%, transparent 70%)"],
    ["oklch", "radial-gradient(circle, oklch(0.7 0.19 40 / 0.6) 0%, transparent 70%)"],
  ])("fires radial-halo on a saturated wash authored in %s", (_space, value) => {
    expect(radial(value)?.rule).toBe("radial-halo");
  });

  test("fires radial-spotlight-glow on a low-alpha OKLCH spotlight", () => {
    expect(radial("radial-gradient(circle, oklch(0.7 0.19 40 / 0.26) 0%, transparent 44%)")?.rule).toBe("radial-spotlight-glow");
  });

  test("stays silent on a neutral vignette — a legitimate lighting move", () => {
    expect(radial("radial-gradient(circle, oklch(0 0 0 / 0.6) 0%, transparent 70%)")).toBeNull();
  });

  test("stays silent on a SANCTIONED carrier — the exemption is the flag, never colour blindness", () => {
    // This is the mechanism the old rgb-only parser was standing in for, and it was already here.
    expect(radial("radial-gradient(circle, oklch(0.7 0.19 40 / 0.6) 0%, transparent 70%)", true)).toBeNull();
  });

  test("stays silent on a gradient that does not fade out — that is a background, not a glow", () => {
    expect(radial("radial-gradient(circle, oklch(0.7 0.19 40) 0%, oklch(0.3 0.1 40) 70%)")).toBeNull();
  });
});
