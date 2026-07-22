// The CEL seam (@orb/kit/cel — automation-design/02 §1-3): the committed golden vector suite plus the
// parse-time cap, the runtime-error posture, and the determinism guarantee that makes testRule replays
// exact. One evaluator, two roles (rule predicates + the {{expr}} macro).

import type { CelBindings, CelProgram } from "@orb/kit/cel";
import { CelEvalError, evalCel, isCelParseError, parseCel } from "@orb/kit/cel";
import { expect, test } from "../../support/fixtures";
import goldens from "./cel-goldens.json" with { type: "json" };

interface Golden {
  readonly name: string;
  readonly expr: string;
  readonly env: CelBindings;
  readonly expected?: unknown;
  readonly error?: "parse" | "eval";
}

type Outcome = { readonly kind: "parse-error" } | { readonly kind: "eval-error" } | { readonly kind: "value"; readonly value: unknown };

// Run a whole expression through the seam into a single discriminated outcome — one unconditional
// assertion per golden (biome's noConditionalExpect: no expect() behind an if/try).
function runCel(expr: string, env: CelBindings): Outcome {
  const program = parseCel(expr);
  if (isCelParseError(program)) {
    return { kind: "parse-error" };
  }
  try {
    return { kind: "value", value: evalCel(program, env) };
  } catch (err) {
    if (err instanceof CelEvalError) {
      return { kind: "eval-error" };
    }
    throw err;
  }
}

function expectedOutcome(c: Golden): Outcome {
  if (c.error === "parse") {
    return { kind: "parse-error" };
  }
  if (c.error === "eval") {
    return { kind: "eval-error" };
  }
  return { kind: "value", value: c.expected };
}

// A parse that must succeed — narrows the union without a conditional expect().
function mustParse(expr: string): CelProgram {
  const program = parseCel(expr);
  if (isCelParseError(program)) {
    throw new Error(`unexpected CEL parse error for "${expr}": ${program.message}`);
  }
  return program;
}

// ── the golden vector suite ───────────────────────────────────────────────────────────────────

for (const c of goldens as readonly Golden[]) {
  test(`cel golden: ${c.name}`, () => {
    expect(runCel(c.expr, c.env)).toEqual(expectedOutcome(c));
  });
}

// ── determinism (the testRule-replay + golden-stability guarantee) ────────────────────────────

test("evalCel is deterministic — same program + env → identical result across runs", () => {
  const program = mustParse("now.hour >= 9 && now.hour < 17");
  const env: CelBindings = { now: { hour: 14 } };
  expect(evalCel(program, env)).toBe(evalCel(program, env));
});

// ── the 2 KiB parse-time cap (the whole budget — CEL is linear-time) ──────────────────────────

test("parseCel refuses a source over the 2 KiB cap with code source-too-long", () => {
  const oversized = `"${"a".repeat(2100)}"`; // valid-syntax string literal above the byte cap
  const result = parseCel(oversized);
  expect(isCelParseError(result) ? result.code : "not-a-parse-error").toBe("source-too-long");
});

test("parseCel accepts a source under the cap boundary", () => {
  const atCap = `"${"a".repeat(2040)}"`; // under 2048 bytes including the quotes
  expect(isCelParseError(parseCel(atCap))).toBe(false);
});

// ── normalization: CEL bigint ints surface as JS number (the JSON-safe plane) ─────────────────

test("evalCel normalizes integer results to number", () => {
  expect(evalCel(mustParse("1 + 2"), {})).toBe(3);
});
