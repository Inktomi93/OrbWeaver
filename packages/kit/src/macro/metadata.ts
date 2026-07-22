// kit/macro/metadata — the macro-DX parity layer FUNCTIONS (automation-design/02 §5): arg validation
// (strict/lenient) + the autocomplete query API. The metadata TYPE surface + MACRO_CATEGORIES live in
// types.ts (with the other macro types) so the registry can reference them without an import cycle; this
// file imports DOWN from types.ts only. Pure + isomorphic — the client bundles the same registry for
// editor autocomplete, so nothing here touches server/node concerns.

import type { MacroArgDef, MacroCategory, MacroDiagnostic, MacroMetadata, MacroRegistry, MacroSpan } from "./types";

const BOOLEAN_LITERALS = new Set(["true", "false", "on", "off", "0", "1", ""]);

// Does `value` coerce to the declared arg type? string always passes; number = finite Number(); boolean =
// one of the accepted literals (the {{#if}} truthiness vocabulary). Empty string is tolerated for optional
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

/** Validate a macro call's RESOLVED args against its metadata. Returns the diagnostics (arity + per-arg
 *  type) at `severity` — `"error"` under strictArgs (the rule/template editors), `"warning"` otherwise
 *  (default-lenient: imported ST content is sloppy). An empty array = the call is well-formed.
 *  Determinism: pure function of (metadata, args, span, strict); no clock/PRNG. */
export function validateMacroArgs(metadata: MacroMetadata, args: readonly string[], span: MacroSpan, strict: boolean): MacroDiagnostic[] {
  const severity = strict ? "error" : "warning";
  const out: MacroDiagnostic[] = [];
  const required = metadata.args.filter((a) => !a.optional).length;
  const max = metadata.variadic ? Number.POSITIVE_INFINITY : metadata.args.length;

  if (args.length < required) {
    out.push({ severity, code: "bad-arity", message: `{{${metadata.name}}} expects at least ${required} argument(s), got ${args.length}`, span });
  } else if (args.length > max) {
    out.push({ severity, code: "bad-arity", message: `{{${metadata.name}}} takes at most ${max} argument(s), got ${args.length}`, span });
  }

  const lastDefIndex = metadata.args.length - 1;
  for (let i = 0; i < args.length; i += 1) {
    // Variadic tail validates against the last declared arg def; non-variadic extras were already
    // flagged by the arity check above, so a missing def here just means "no type constraint".
    const def = metadata.args[Math.min(i, lastDefIndex)];
    const value = args[i];
    if (def === undefined || value === undefined || def.type === "string") {
      continue;
    }
    if (!coercesTo(value, def.type)) {
      out.push({ severity, code: "bad-arg-type", message: `{{${metadata.name}}} arg #${i + 1} (${def.name}) expects ${def.type}, got "${value}"`, span });
    }
  }
  return out;
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
