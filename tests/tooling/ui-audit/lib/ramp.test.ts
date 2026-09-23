// The ramp bindings are DERIVED from live tokens, so a token whose SERIALIZATION changes can silently
// change what every ramp-bound rule means. These pin the derivation itself: finite, in band, and still
// judging. Sibling behaviour lives in tests/tooling/ui-audit/index.test.ts (the rule proofs).
import type { TextStyleInput } from "../../../../tooling/src/ui-audit/contract/samples.ts";
import { checkTextStyle } from "../../../../tooling/src/ui-audit/lib/checks-typography.ts";
import { INTERACTIVE_TEXT_FLOOR_PX, LEADING_FLOOR, RAMP_FONT_FACES, TEXT_MICRO_PX } from "../../../../tooling/src/ui-audit/lib/ramp.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// ── THE COUPLING THIS EXISTS FOR (docs/law/integer-line-boxes.md §3b/§6) ──────────────────────────
// `leading.*` becomes a px-resolving DIMENSION emitted as `round(up, 1rem, 1px)`, so `TOKENS[path].value`
// stops being a number and `Number(...)` of it is NaN. §6 routes the re-derivation
// (`SNAPPED_LENGTH_BASE_PX["leading.label"] / (parseFloat(TOKENS["text.label"].value) * REM_PX)`
// = 16/13 ≈ 1.2308) — that companion map is the sanctioned surface because §3b's own rule is
// "consumers never parse the serialization".
//
// MEASURED CORRECTION to §6's stated direction, which says the NaN floor makes tight-leading "silently
// fail open": it does the OPPOSITE. `checkTightLeading` returns null when
// `ratio >= LEADING_FLOOR - EPSILON`, and EVERY comparison against NaN is false, so the guard never
// returns and the rule FIRES ON EVERY qualifying text — a P3 flood printing "floor NaN", not a silence.
// Node, against the post-change spelling: ratios 1.55 / 1.25 / 1.05 all fire under `Number("round(up, 1rem,
// 1px)")`. Loud rather than silent is the better failure, but it is a different failure, and the fix is
// the same one either way.
//
// So this file is the TRIPWIRE for that landing: it is green on the numeric spelling, and goes RED the
// moment the snapped tokens are generated without §6's re-derivation — at the lane floor, instead of at
// whichever surface next reads a flood of "floor NaN" P3s.

test("every ramp binding derived from a token is a finite number — a serialization change must not silently become NaN", () => {
  for (const [name, value] of [
    ["TEXT_MICRO_PX", TEXT_MICRO_PX],
    ["LEADING_FLOOR", LEADING_FLOOR],
    ["INTERACTIVE_TEXT_FLOOR_PX", INTERACTIVE_TEXT_FLOOR_PX],
  ] as const) {
    expect(Number.isFinite(value), `${name} derived to ${String(value)} — its token's value is no longer numeric`).toBe(true);
  }
  // In BAND, not merely finite: a floor of 0 or 16 is finite and equally meaningless. The band spans
  // every ratified leading step (label 1.231 → body 1.533) with room on both sides.
  expect(LEADING_FLOOR).toBeGreaterThan(1);
  expect(LEADING_FLOOR).toBeLessThan(2);
  // The face set is derived from the SAME token file by a different path (a list, not a number), so a
  // vocabulary change empties it rather than NaN-ing it. Empty = every face reads off-ramp.
  expect(RAMP_FONT_FACES.size).toBeGreaterThan(0);
});

test("the leading floor still JUDGES — ratified leading passes and genuinely tight leading fires", () => {
  const base: Omit<TextStyleInput, "lineHeightPx"> = {
    selector: "p.reading",
    authoredTarget: "p|slot=|role=|type=",
    authoredHome: "body::main<div",
    tag: "p",
    directTextLen: 200,
    directText: "a paragraph long enough to be judged for its leading.",
    totalTextLen: 200,
    fontSizePx: 15,
    letterSpacingPx: 0,
    textTransform: "",
    capsText: false,
    textAlign: "left",
    hyphens: "",
    rectWidth: 600,
    chWidthPx: 8,
    isProseTag: false,
    isHeading: false,
    interactive: false,
    codeContext: false,
    srOnly: false,
    ariaHidden: false,
    voice: "",
    alertContext: false,
    blockPath: [],
  };
  const rulesFor = (lineHeightPx: number): string[] => checkTextStyle({ ...base, lineHeightPx }).map(({ rule }) => rule);
  // A NaN floor fires on BOTH of these; a broken-low floor fires on neither. Only a live floor splits them.
  expect(rulesFor(15 * 1.55)).not.toContain("tight-leading");
  expect(rulesFor(15 * 1.05)).toContain("tight-leading");
  // The floor a finding QUOTES is the derived number, so a NaN never reaches an operator as prose.
  const finding = checkTextStyle({ ...base, lineHeightPx: 15 * 1.05 }).find(({ rule }) => rule === "tight-leading");
  expect(finding?.message).not.toContain("NaN");
});
