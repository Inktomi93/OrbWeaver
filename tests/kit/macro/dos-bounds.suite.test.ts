// D46 "macro engine … DoS-bounded" claim — the DEPTH bound pinned via TEMPLATE nesting (the recursion
// seam ST's suite never exercises against ours). The existing index.test.ts already pins: field
// self-reference trips depth + warns once; the 1 MB output cap truncates + warns once. This file closes
// the remaining gap — a legitimately-deep NESTED-BLOCK template renders, and one past MAX_DEPTH aborts to
// "" with a single warning (engine.ts MAX_DEPTH = 64; the guard wraps every evaluateString/evaluateAST
// re-entry). A hostile card can nest blocks arbitrarily deep; this proves the cap catches it.

import type { ProcessMacroOptions } from "@orb/kit/macro";
import { processMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures";

const MAX_DEPTH = 64; // mirrors engine.ts (the value is @internal; this test-mirror is the intended pin)

function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "C", user: "U", persona: "P", scenario: "S", env: {}, ...extra };
}

// Wrap `x` in N levels of `{{#uppercase}}…{{/uppercase}}` — each level is one evaluateAST re-entry, so N
// levels consume N depth units. A pure structural nest (no side effects), so the only thing under test is
// the depth accounting.
function nestUppercase(levels: number): string {
  let inner = "x";
  for (let i = 0; i < levels; i += 1) {
    inner = `{{#uppercase}}${inner}{{/uppercase}}`;
  }
  return inner;
}

test("deep-but-bounded block nesting renders without tripping the depth cap", () => {
  // A few levels below MAX_DEPTH renders fully — the cap is generous, not hair-trigger (real prompts are
  // shallow). 60 nested uppercase blocks fold "x" → "X".
  const warnings: string[] = [];
  const out = processMacros(nestUppercase(MAX_DEPTH - 4), opts({ onWarn: (m) => warnings.push(m) }));
  expect(out).toBe("X");
  expect(warnings).toHaveLength(0);
});

test("block nesting past MAX_DEPTH aborts to empty and warns exactly once", () => {
  // Well past the 64-level cap → the depth guard trips, rendering aborts to "" (latched), and the depth
  // warning fires exactly once (not once per level).
  const warnings: string[] = [];
  const out = processMacros(nestUppercase(MAX_DEPTH * 3), opts({ onWarn: (m) => warnings.push(m) }));
  expect(out).toBe("");
  expect(warnings.filter((w) => w.includes("depth limit"))).toHaveLength(1);
});
