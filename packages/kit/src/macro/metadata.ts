// kit/macro/metadata — the macro-DX parity layer FUNCTIONS (automation-design/02 §5): arg validation
// (strict/lenient) + the autocomplete query API. The metadata TYPE surface + MACRO_CATEGORIES live in
// types.ts (with the other macro types) so the registry can reference them without an import cycle; this
// file imports DOWN from types.ts only. Pure + isomorphic — the client bundles the same registry for
// editor autocomplete, so nothing here touches server/node concerns.

import type { MacroArgDef, MacroArgViolation, MacroCategory, MacroDiagnostic, MacroMetadata, MacroRegistry, MacroSpan } from "./types.ts";

// The {{if}} truthiness vocabulary (owner-ratified): a string is "off" when it is (after trim+lowercase)
// empty or one of these literals — everything else is "on". Shared by {{if}}'s bare-predicate branch
// (registry.ts) and the user-macro boolean-toggle default (`userMacroToggleDefaultsOn`, user-macros.ts) —
// the ONE spelling of the vocabulary, not three.
const FALSY_LITERALS = new Set(["false", "off", "0"]);
const TRUTHY_LITERALS = new Set(["true", "on", "1"]);

/** Does `value` read as "on" under the `{{if}}` truthiness vocabulary? Trimmed+lowercased; empty or a
 *  falsy literal ⇒ false, everything else (including non-vocabulary text) ⇒ true. */
export function isIfTruthy(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v !== "" && !FALSY_LITERALS.has(v);
}

// The coercion superset (checkMacroArgs' bool-arg check, below) — every word the {{if}} vocabulary
// recognizes on either side, plus the empty string (arity, not type, governs presence there).
const BOOLEAN_LITERALS = new Set([...TRUTHY_LITERALS, ...FALSY_LITERALS, ""]);

// Does `value` coerce to the declared arg type? string always passes; number = finite Number(); boolean =
// one of the accepted literals (the {{if}} truthiness vocabulary). Empty string is tolerated for optional
// numeric/boolean args (the setvar::k:: idiom), so arity — not this — governs presence.
function coercesTo(value: string, type: MacroArgDef["type"]): boolean {
  if (type === "string") {
    return true;
  }
  const v = value.trim();
  if (v === "") {
    return true;
  }
  if (type === "number") {
    return Number.isFinite(Number(v));
  }
  return BOOLEAN_LITERALS.has(v.toLowerCase());
}

/** Extra call-shape context for {@link checkMacroArgs}. `contentArgs` = how many trailing args are a
 *  scoped-block BODY delivered as content-as-last-arg (0 inline, 1 universal-block) — block capability
 *  is UNIVERSAL (M1, deliberately undeclared per-macro), so the body slot must never trip too-many. */
export interface CheckMacroArgsOptions {
  readonly contentArgs?: number;
}

// The arity half of checkMacroArgs, split out so each half stays under the complexity cap.
function checkArity(metadata: MacroMetadata, count: number, contentArgs: number): MacroArgViolation[] {
  const out: MacroArgViolation[] = [];
  const required = metadata.args.filter((a) => !a.optional).length;
  if (count < required) {
    out.push({ kind: "missing-required", macro: metadata.name, message: `{{${metadata.name}}} expects at least ${required} argument(s), got ${count}` });
    return out;
  }
  if (metadata.variadic) {
    // The LIST spec (§12A.3) bounds a variadic macro's TOTAL arg count; the content slot is exempt.
    const min = metadata.list?.min;
    const max = metadata.list?.max;
    const counted = count - contentArgs;
    if (min !== undefined && counted < min) {
      out.push({ kind: "list-bounds", macro: metadata.name, message: `{{${metadata.name}}} expects at least ${min} argument(s), got ${counted}` });
    } else if (max !== undefined && counted > max) {
      out.push({ kind: "list-bounds", macro: metadata.name, message: `{{${metadata.name}}} takes at most ${max} argument(s), got ${counted}` });
    }
    return out;
  }
  const max = metadata.args.length + contentArgs;
  if (count > max) {
    out.push({ kind: "too-many-args", macro: metadata.name, message: `{{${metadata.name}}} takes at most ${metadata.args.length} argument(s), got ${count}` });
  }
  return out;
}

/** The M3 runtime-enforcement core (§12A.3): check a macro call's DELIVERED args against its declared
 *  contract and return the typed violations (arity, list bounds, per-arg type). Pure function of its
 *  inputs — the evaluator and validateMacroArgs both derive from THIS so the runtime posture and the
 *  authoring diagnostics can never disagree. An arg still containing `{{` (a lazy-delivered raw arg or
 *  an unknown-macro passthrough) is exempt from the TYPE check — its value isn't knowable here. */
export function checkMacroArgs(metadata: MacroMetadata, args: readonly string[], opts: CheckMacroArgsOptions = {}): MacroArgViolation[] {
  const out = checkArity(metadata, args.length, opts.contentArgs ?? 0);
  const lastDefIndex = metadata.args.length - 1;
  for (let i = 0; i < args.length; i += 1) {
    // Variadic tail validates against the last declared arg def; non-variadic extras were already
    // flagged by the arity check above, so a missing def here just means "no type constraint".
    const def = metadata.args[Math.min(i, lastDefIndex)];
    const value = args[i];
    if (def === undefined || value === undefined || def.type === "string" || value.includes("{{")) {
      continue;
    }
    if (!coercesTo(value, def.type)) {
      out.push({
        kind: "bad-type",
        macro: metadata.name,
        argIndex: i,
        argName: def.name,
        message: `{{${metadata.name}}} arg #${i + 1} (${def.name}) expects ${def.type}, got "${value}"`,
      });
    }
  }
  return out;
}

/** Pad a call's delivered args with the declared optional-suffix `default`s (M3: the metadata IS the
 *  runtime contract — a declared default reaches the handler, not just the browser copy). Padding stops
 *  at the first missing-default def (defaults form a contiguous run) and never touches a call that
 *  already supplied the position. Returns `args` unchanged (same reference) when nothing pads. */
export function applyArgDefaults(metadata: MacroMetadata | undefined, args: string[]): string[] {
  if (metadata === undefined || args.length >= metadata.args.length) {
    return args;
  }
  const padded = [...args];
  for (let i = args.length; i < metadata.args.length; i += 1) {
    const def = metadata.args[i];
    if (def?.default === undefined) {
      break;
    }
    padded.push(def.default);
  }
  return padded.length > args.length ? padded : args;
}

/** Map typed violations onto positional diagnostics — the ONE violation-kind→diagnostic-code fold
 *  ("bad-type" → "bad-arg-type"; the arity/list kinds → "bad-arity", keeping the diagnostic code union
 *  narrow so no consumer churns). Severity: `"error"` under strict, `"warning"` otherwise. */
export function macroArgDiagnostics(violations: readonly MacroArgViolation[], span: MacroSpan, strict: boolean): MacroDiagnostic[] {
  const severity = strict ? "error" : "warning";
  return violations.map((violation) => ({
    severity,
    code: violation.kind === "bad-type" ? "bad-arg-type" : "bad-arity",
    message: violation.message,
    span,
  }));
}

/** Validate a macro call's RESOLVED args against its metadata. Returns the diagnostics (arity + per-arg
 *  type) at `severity` — `"error"` under strictArgs (the rule/template editors), `"warning"` otherwise
 *  (default-lenient: imported ST content is sloppy). An empty array = the call is well-formed. Derived
 *  from {@link checkMacroArgs} + {@link macroArgDiagnostics} (the ONE violation home — the evaluator's
 *  runtime enforcement composes the same pair). Determinism: pure function of its inputs; no clock/PRNG. */
export function validateMacroArgs(metadata: MacroMetadata, args: readonly string[], span: MacroSpan, strict: boolean): MacroDiagnostic[] {
  return macroArgDiagnostics(checkMacroArgs(metadata, args), span, strict);
}

/** Autocomplete / browser query (02 §5). Name-or-alias prefix match + category filter over the registry's
 *  composed metadata, stable name-sorted. Pure + isomorphic — the editor calls this on every keystroke
 *  against the client registry and merges with a `macro.list` tRPC read of the server registry. */
export function queryMacros(registry: MacroRegistry, q: { prefix?: string; category?: MacroCategory }): readonly MacroMetadata[] {
  const prefix = q.prefix?.toLowerCase();
  const out: MacroMetadata[] = [];
  for (const meta of registry.allMetadata()) {
    if (q.category !== undefined && meta.category !== q.category) {
      continue;
    }
    if (prefix !== undefined && prefix !== "") {
      const names = [meta.name, ...meta.aliases];
      if (!names.some((n) => n.toLowerCase().startsWith(prefix))) {
        continue;
      }
    }
    out.push(meta);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
