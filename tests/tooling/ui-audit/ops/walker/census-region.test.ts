// ONE FORMULA, TWO SPELLINGS — pinned (#1327). `relLum` inside `WALKER_CENSUS_REGION` and
// `_shared/wcag.ts`'s `relativeLuminance` are the same WCAG 2.x relative-luminance kernel written twice,
// necessarily: one ships to the page as an ES5 string (no imports reach in there), the other runs in Node.
// Nothing pinned their equality, so a drift on either side — a re-tuned knee, a transposed channel
// weight, a `**` that is not a `Math.pow` — would silently make the in-page quiet-state ordering disagree
// with every Node-side contrast verdict, and both sides would still look correct in isolation.
//
// The page half is EXTRACTED FROM THE SHIPPED STRING (the constants block plus the function, byte-for-byte
// what the browser evaluates) and run through `node:vm`, the same door census-grid.test.ts uses — never a
// copy of the formula, which would pin the copy. The extraction REFUSES loudly when its markers move, so a
// renamed constant is a red rather than a silently-skipped file; and the last arm is the planted positive
// control: a one-digit mutation of the extracted source must make the two sides disagree, or this file
// proves nothing.
import { runInNewContext } from "node:vm";
import type { Rgb } from "@orb/tooling/_shared/wcag";
import { relativeLuminance } from "@orb/tooling/_shared/wcag";
import { WALKER_CENSUS_REGION } from "../../../../../tooling/src/ui-audit/ops/walker/census-region.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

const CONSTANTS_START = "var LUM_R = 0.2126;";
const FUNCTION_START = "function relLum(rgb) {";
const FUNCTION_END = "\n  }";

/** The in-page luminance kernel, sliced out of the segment the browser actually evaluates. */
function pageLuminanceSource(): string {
  const constants = WALKER_CENSUS_REGION.indexOf(CONSTANTS_START);
  const start = WALKER_CENSUS_REGION.indexOf(FUNCTION_START);
  if (constants < 0 || start < 0 || constants > start) {
    throw new Error(`census-region.ts no longer spells '${CONSTANTS_START}' before '${FUNCTION_START}' — re-anchor this pin`);
  }
  const end = WALKER_CENSUS_REGION.indexOf(FUNCTION_END, start);
  if (end < 0) {
    throw new Error(`census-region.ts's relLum has no closing brace at the expected indent — re-anchor this pin`);
  }
  return `${WALKER_CENSUS_REGION.slice(constants, end + FUNCTION_END.length)}\nrelLum`;
}

function compile(source: string): (rgb: Rgb) => number {
  return runInNewContext(source) as (rgb: Rgb) => number;
}

/** Channel values chosen to exercise BOTH gamma arms and their boundary: the knee sits at a normalized
 *  channel of 0.03928 or below, i.e. an 8-bit channel of 10.0164, so 10 takes the linear divisor and 11
 *  takes the power curve. (Spelled in words: a less-than sign here is an HTML tag to tsdoc.) */
const TRIPLES: readonly Rgb[] = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 },
  { r: 10, g: 10, b: 10 },
  { r: 11, g: 11, b: 11 },
  { r: 1, g: 10, b: 11 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 18, g: 18, b: 20 },
  { r: 128, g: 64, b: 32 },
  { r: 250, g: 249, b: 245 },
];

test("the in-page relLum and _shared/wcag relativeLuminance are bit-identical over both gamma arms", () => {
  const relLum = compile(pageLuminanceSource());
  for (const rgb of TRIPLES) {
    expect(relLum(rgb), `sRGB ${String(rgb.r)},${String(rgb.g)},${String(rgb.b)}`).toBe(relativeLuminance(rgb));
  }
});

test("the extraction can see a drift: a one-digit change to the page channel weight disagrees with Node", () => {
  const mutated = compile(pageLuminanceSource().replace("var LUM_R = 0.2126;", "var LUM_R = 0.2127;"));
  expect(mutated({ r: 255, g: 0, b: 0 })).not.toBe(relativeLuminance({ r: 255, g: 0, b: 0 }));
});
