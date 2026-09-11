// kit/cel — the CEL expression seam. A THIN wrapper over `@marcbachmann/cel-js` so the dependency is
// pinned in ONE home (swap the lib here, nowhere else) and the evaluator stays isomorphic — the client
// rule-editor validates predicates with the exact same code the server dispatch uses. Two roles compose
// over one evaluator: automation rule predicates and the `{{expr::…}}` macro (kit/macro). CEL is
// linear-time + mutation-free by construction, so the
// PARSE-TIME source cap (≤ 2 KiB) IS the whole budget — no runtime watchdog (contrast kit/regex, whose
// node:vm timeout exists only because regex backtracking is superlinear).

import type { ASTNode } from "@marcbachmann/cel-js";
import { EvaluationError, ParseError, parse } from "@marcbachmann/cel-js";

// The source-length cap. Bytes, not chars — a multi-byte predicate can't sneak past a char cap.
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
 *  supplies the env: vars/choice/global/chat/now/event). Values are `unknown` at this seam; the
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
  /** Every ROOT IDENTIFIER this program reads, in first-seen order — "which named bindings does this
   *  expression need?", answered STATICALLY (no evaluation, no activation).
   *
   *  LAZY BY CONSTRUCTION: the walk runs on the first call and never on `parseCel` itself, because the hot
   *  consumer of `parseCel` is the per-event dispatch predicate evaluation and it asks this of nothing. The
   *  one caller today is an AUTHORING gate (automation's owner-global mint, which refuses a predicate naming
   *  a chat-keyed root on a rule that has no chat), which runs once per stored rule.
   *
   *  WHAT COUNTS AS A ROOT, stated because the answer is what a caller may rely on: every `id` node in the
   *  tree. Member selections (`chat.messageCount`) carry their field as a STRING, not a node, so only `chat`
   *  is reported; function names (`has`, `int`) are strings too, so a builtin is never mistaken for a
   *  binding. The one over-report is a COMPREHENSION variable (`list.all(chat, …)` binds `chat` locally and
   *  would be reported) — deliberately accepted, because every caller is a fail-CLOSED gate for which an
   *  over-report is a refusal to explain rather than a hole to walk through. */
  readonly rootIdentifiers: () => readonly string[];
}

/** Collect every `id` node's name from an AST subtree, in first-seen order, into `out`. Recursive over the
 *  operator's own operand shape — `args` is operator-keyed (`ASTNodeArgsMap`), so the walk reads it
 *  structurally rather than by a per-operator switch this wrapper would have to re-sync with the lib. */
function collectRootIdentifiers(node: unknown, out: string[]): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectRootIdentifiers(child, out);
    }
    return;
  }
  const { op, args } = node as { readonly op?: unknown; readonly args?: unknown };
  if (op === "id") {
    // An `id` node's payload IS the name (a string, never a child node).
    if (typeof args === "string" && !out.includes(args)) {
      out.push(args);
    }
    return;
  }
  // `value` holds a LITERAL (string/number/bytes) — never a child node, and a string literal is not a root.
  if (op === "value") {
    return;
  }
  collectRootIdentifiers(args, out);
}

/** Thrown by {@link evalCel} on a RUNTIME failure (missing field without `has()`, type mismatch). The
 *  automation posture: the caller catches this and SKIPS the rule / renders `""` — the turn is
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
  if (!source.isWellFormed()) {
    return { kind: "cel-parse-error", code: "invalid-utf16", message: "CEL source contains an unpaired UTF-16 surrogate" };
  }
  if (utf8ByteLength(source) > CEL_MAX_SOURCE_BYTES) {
    return { kind: "cel-parse-error", code: "source-too-long", message: `CEL source exceeds the ${CEL_MAX_SOURCE_BYTES}-byte cap` };
  }
  // @orb-waive caught-failure-ownership(err): documented contract "parseCel never throws" —
  // any parse error is returned as CelParseError data, consumed by every caller as the error arm of the
  // union. Ends if a caller stops handling the CelParseError arm.
  try {
    const program = parse(source);
    // The AST is captured but NEVER walked here — `rootIdentifiers` is the lazy door (see its doc). The
    // local type-only `ASTNode` annotation is what keeps the lib's node shape from leaking into the seam.
    const ast: ASTNode = program.ast;
    return {
      kind: "cel-program",
      source,
      evaluate: (bindings) => program(bindings),
      rootIdentifiers: (): readonly string[] => {
        const out: string[] = [];
        collectRootIdentifiers(ast, out);
        return out;
      },
    };
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
