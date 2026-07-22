// kit/cel — the CEL expression seam (automation-design/02 §1-3). A THIN wrapper over
// `@marcbachmann/cel-js` so the dependency is pinned in ONE home (swap the lib here, nowhere else) and
// the evaluator stays isomorphic — the client rule-editor validates predicates with the exact same code
// the server dispatch uses. Two roles compose over one evaluator: automation rule predicates (A5) and
// the `{{expr::…}}` macro (kit/macro). CEL is linear-time + mutation-free by construction, so the
// PARSE-TIME source cap (≤ 2 KiB) IS the whole budget — no runtime watchdog (contrast kit/regex, whose
// node:vm timeout exists only because regex backtracking is superlinear).

import { EvaluationError, ParseError, parse } from "@marcbachmann/cel-js";

// The source-length cap (02 §1). Bytes, not chars — a multi-byte predicate can't sneak past a char cap.
const CEL_MAX_SOURCE_BYTES = 2048;

// UTF-8 byte length WITHOUT TextEncoder — kit is isomorphic (tsconfig lib=es2025, types=[]), so
// TextEncoder/Buffer are unavailable (the png-card-chunk kit-purity note). encodeURIComponent emits one
// literal char per ASCII byte and a `%XX` triple per other byte, so collapsing each triple to one char
// yields the byte count.
function utf8ByteLength(source: string): number {
  return encodeURIComponent(source).replace(/%[0-9A-F]{2}/g, "_").length;
}

/** A JSON-safe CEL result — scalars, lists, maps. No functions/handles (the activation is data-only). */
export type CelValue = string | number | boolean | null | readonly CelValue[] | { readonly [key: string]: CelValue };

/** The activation object a program evaluates against — a data-only map of named bindings (the caller
 *  supplies the §1 env: vars/choice/global/chat/now/event). Values are `unknown` at this seam; the
 *  domain's cel-env builder is what shapes them. */
export type CelBindings = Record<string, unknown>;

/** A parse-time failure (bad syntax or over the source cap). Returned, never thrown — the caller
 *  (createRule/updateRule, the editor) turns it into a stored-refusal or an inline diagnostic. */
export interface CelParseError {
  readonly kind: "cel-parse-error";
  readonly message: string;
  readonly code: string;
}

/** A compiled, reusable CEL program. Opaque by design — `evaluate` is the captured runner and exposes
 *  NO `@marcbachmann/cel-js` type, so the lib can be swapped without touching any consumer. Call it via
 *  {@link evalCel}, never directly. */
export interface CelProgram {
  readonly kind: "cel-program";
  readonly source: string;
  /** @internal — the captured evaluator; go through evalCel (it normalizes + wraps eval errors). */
  readonly evaluate: (bindings: CelBindings) => unknown;
}

/** Thrown by {@link evalCel} on a RUNTIME failure (missing field without `has()`, type mismatch). The
 *  automation posture (02 §1): the caller catches this and SKIPS the rule / renders `""` — the turn is
 *  never affected. A kit-local error so `@marcbachmann/cel-js`'s EvaluationError never leaks to catch sites. */
export class CelEvalError extends Error {
  override readonly name = "CelEvalError";
}

export function isCelParseError(value: CelProgram | CelParseError): value is CelParseError {
  return value.kind === "cel-parse-error";
}

/** Parse + validate a CEL source string. Enforces the ≤ 2 KiB cap, then compiles. Returns a reusable
 *  {@link CelProgram} or a {@link CelParseError} — NEVER throws (parse-time errors are values here). */
export function parseCel(source: string): CelProgram | CelParseError {
  if (utf8ByteLength(source) > CEL_MAX_SOURCE_BYTES) {
    return { kind: "cel-parse-error", code: "source-too-long", message: `CEL source exceeds the ${CEL_MAX_SOURCE_BYTES}-byte cap` };
  }
  try {
    const program = parse(source);
    return { kind: "cel-program", source, evaluate: (bindings) => program(bindings) };
  } catch (err) {
    if (err instanceof ParseError) {
      return { kind: "cel-parse-error", code: err.code, message: err.summary };
    }
    // A non-ParseError from parse() is unexpected; surface it as a parse error rather than throwing —
    // the caller's contract is "parseCel never throws".
    return { kind: "cel-parse-error", code: "parse-failed", message: err instanceof Error ? err.message : String(err) };
  }
}

// CEL integers arrive as bigint; JSON.stringify (the {{expr}} list/map coercion) can't serialize bigint,
// and the string plane is all-strings anyway — normalize to number, recursing through lists/maps.
function normalizeCel(value: unknown): CelValue {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeCel);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, CelValue> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = normalizeCel(v);
    }
    return out;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  // Anything else (undefined, functions, symbols) is not a CEL data value — coerce to its string form
  // rather than leak a non-CelValue; in practice the evaluator never returns these.
  return String(value);
}

/** Evaluate a compiled program against `bindings`. Returns the normalized {@link CelValue}; throws
 *  {@link CelEvalError} on a runtime failure (the caller catches → skip/`""`). */
export function evalCel(program: CelProgram, bindings: CelBindings): CelValue {
  try {
    return normalizeCel(program.evaluate(bindings));
  } catch (err) {
    if (err instanceof EvaluationError) {
      throw new CelEvalError(err.summary, { cause: err });
    }
    throw new CelEvalError(err instanceof Error ? err.message : String(err), { cause: err });
  }
}
