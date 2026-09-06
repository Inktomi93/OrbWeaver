// THE PERMANENT PIN for the radial-wash rules' STOP LIST (#1808, from #1504 claim 4).
//
// THE LIE. `extractRadialStopArgs` filtered a gradient's args with `isStopArg` — "does `findColorToken`
// read a colour out of this?" — and then checked `RADIAL_MIN_STOPS` against the POST-FILTER length. That
// one predicate answered two different questions with the same word: a `0%` position hint and a
// `hwb(200 20% 10%)` stop the reader cannot parse both came back "not a stop", so an unparseable colour
// was silently DROPPED and the rule judged the remainder as if it were the whole gradient. A three-stop
// wash with one unreadable stop still cleared the two-stop minimum, and its own docstring claimed the
// opposite ("unparseable color spaces yield too few stops and refuse").
//
// It is not a hypothetical spelling: `lib/css-color.ts`'s header states, with a measured 2026-09-01
// receipt, that `color-mix()` and `hwb()` come back NULL from the reader by design (`isSafeColor` is a
// SECURITY predicate, D44 §12.1, and admits neither) — the module relies on Chromium resolving them in
// computed style. Any value that reaches this checker still carrying one is an unresolved stop.
//
// The polarity is the population contract's (`contract/findings.ts`): a gradient this reader cannot read
// WHOLE is missing evidence — `withheld`, which makes the run NO VERDICT — never a judged pass, and never
// a finding minted off the args that happened to parse.
import { describe } from "vitest";
import { checkRadialGlow, classifyRadialGlow } from "../../../../tooling/src/ui-audit/lib/checks-ornament.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const HALO_STOP = "rgba(255, 90, 40, 0.6)";
const SPOTLIGHT_STOP = "rgba(80, 111, 255, 0.26)";
/** Colour-SHAPED and unreadable: `hwb()` is refused by the one reader (css-color.ts header). */
const UNRESOLVED_STOP = "hwb(200 20% 10%)";

function halo(value: string, sanctioned = false): ReturnType<typeof checkRadialGlow> {
  return checkRadialGlow({ selector: ".hero", value, width: 800, height: 400, sanctioned });
}

function disposition(value: string, sanctioned = false): { readonly kind: string; readonly reason?: string } {
  const result = classifyRadialGlow({ selector: ".hero", value, width: 800, height: 400, sanctioned }, "radial-halo");
  return result.kind === "judged" ? { kind: "judged" } : { kind: result.kind, reason: result.reason };
}

describe("radial washes — an unreadable stop is refused, never dropped", () => {
  test("a fully readable saturated wash FIRES — the fence below never buys silence", () => {
    expect(halo(`radial-gradient(circle, ${HALO_STOP} 0%, transparent 70%)`)?.rule).toBe("radial-halo");
    expect(disposition(`radial-gradient(circle, ${HALO_STOP} 0%, transparent 70%)`).kind).toBe("judged");
  });

  test("a three-stop wash with ONE unreadable stop is WITHHELD, not judged on the two that parsed", () => {
    const value = `radial-gradient(circle, ${UNRESOLVED_STOP} 0%, ${HALO_STOP} 40%, transparent 70%)`;
    // Before the fix this cleared RADIAL_MIN_STOPS on the post-filter list and emitted radial-halo off an
    // incomplete gradient — a finding about a wash the instrument had only partly read.
    expect(halo(value)).toBeNull();
    expect(disposition(value)).toStrictEqual({ kind: "withheld", reason: "unresolvedGradientStop" });
  });

  test("the unreadable stop is refused at the SPOTLIGHT alpha too — the refusal is the gradient's, not one rule's", () => {
    const value = `radial-gradient(circle, ${UNRESOLVED_STOP}, ${SPOTLIGHT_STOP} 20%, transparent 44%)`;
    expect(halo(value)).toBeNull();
    const spotlight = classifyRadialGlow({ selector: ".hero", value, width: 800, height: 400, sanctioned: false }, "radial-spotlight-glow");
    expect(spotlight).toStrictEqual({ kind: "withheld", reason: "unresolvedGradientStop" });
  });

  test("a SANCTIONED carrier stays excluded — the owner exemption outranks the refusal, so an exempt carrier never mints a NO VERDICT", () => {
    const value = `radial-gradient(circle, ${UNRESOLVED_STOP} 0%, ${HALO_STOP} 40%, transparent 70%)`;
    expect(disposition(value, true)).toStrictEqual({ kind: "excluded", reason: "sanctionedGlowCarrier" });
  });

  // THE NEGATIVE HALF, and the reason the fix cannot be "anything the reader declines is unresolved": a
  // radial gradient's non-colour args are its shape prelude and its position hints, which the reader
  // declines by construction. Reading those as unresolved would turn every wash on the tree into a NO
  // VERDICT — the cry-wolf failure mode (memory `empty-population-vs-broken-probe`).
  test.each([
    ["a bare shape prelude", `radial-gradient(circle, ${HALO_STOP}, transparent 70%)`],
    ["a positioned ellipse", `radial-gradient(ellipse at 50% 30%, ${HALO_STOP} 0%, transparent 70%)`],
    ["an extent keyword", `radial-gradient(closest-side at 20px 40px, ${HALO_STOP} 0%, transparent 70%)`],
    ["a colour-interpolation clause", `radial-gradient(circle in oklab, ${HALO_STOP} 0%, transparent 70%)`],
    ["a bare colour-hint position", `radial-gradient(circle, ${HALO_STOP} 0%, 35%, transparent 70%)`],
    ["a calc() position", `radial-gradient(circle at calc(50% + 10px) 30%, ${HALO_STOP} 0%, transparent 70%)`],
  ])("%s is structural, not an unreadable stop — the wash is still judged and still fires", (_label, value) => {
    expect(halo(value)?.rule, value).toBe("radial-halo");
    expect(disposition(value).kind).toBe("judged");
  });

  test("a value carrying no radial-gradient at all is a judged clean pass, not a refusal", () => {
    expect(halo("linear-gradient(90deg, rgb(20, 20, 30), rgb(40, 40, 60))")).toBeNull();
    expect(disposition("linear-gradient(90deg, rgb(20, 20, 30), rgb(40, 40, 60))").kind).toBe("judged");
  });

  test("a one-stop radial is a judged clean pass — too few stops is the rule answering no, not missing evidence", () => {
    expect(disposition(`radial-gradient(circle, ${HALO_STOP})`).kind).toBe("judged");
  });
});
