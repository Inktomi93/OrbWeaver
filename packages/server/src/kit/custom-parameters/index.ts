// @orb/server/kit/custom-parameters — the Layer-2 prototype-pollution defense: `deepMergeRequestBody`.
// Layer 1 (`@orb/contracts/preset` `customParametersSchema` `superRefine`) rejects `constructor`/
// `prototype` at the boundary (Zod v4 already strips `__proto__`); THIS is the runtime merge-time check
// every runner overlay must route through — the two-layer invariant (`Core-Audits-and-Debt.md` PD-101,
// `Core-Shared-Dissolution.md`) is only real once both sides exist. A caller that skips this and spreads
// `customParameters` directly (a shallow `{...custom, ...owned}`) is back to Layer-1-only.
//
// Recursion + own-key-only precedent: mirrors `domain/settings/substrate/merge.ts` `deepMergePlain`
// (plain objects recurse, arrays/primitives replace) — this is that shape PLUS the forbidden-key guard,
// because unlike settings patches (schema-validated, trusted shape), a request-body overlay walks
// caller-supplied `customParameters` that Layer 1 validated but a defense-in-depth caller may not have.

import { isPlainObject } from "@orb/kit/guards";

// Same vocabulary as `@orb/contracts/preset`'s `FORBIDDEN_KEYS` (Layer 1) — kept as a literal copy, not an
// import: preset is a down-dep of server, so server CAN import it, but re-declaring this tiny closed set
// avoids coupling Layer 2 to Layer 1's internal (unexported) constant. Both layers cite `__proto__` /
// `constructor` / `prototype` — the sole prototype-pollution attack surface in a plain-object merge.
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

// Deep-strip FORBIDDEN_KEYS from a value that is being copied WHOLESALE (a key present on only one side
// of the merge, or a leaf that wins outright on a type mismatch) — a subtree that never goes through the
// key-by-key merge loop below still needs its own poison keys scrubbed at every depth, or a `nested.foo`
// object copied straight from `patch` would carry its `__proto__`/`constructor` through untouched.
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (!FORBIDDEN_KEYS.has(key)) {
      out[key] = sanitize(value[key]);
    }
  }
  return out;
}

/**
 * Recursively merge `patch` onto `base` — SECOND ARGUMENT WINS at any leaf/type-mismatch (same
 * last-spread-wins convention as `domain/settings/substrate/merge.ts` `deepMergePlain`; the CALLER
 * encodes its own precedence by argument order — e.g. `deepMergeRequestBody(customParameters, owned)`
 * for "owned wins", or the reverse for "user wins"). Any `__proto__`/`constructor`/`prototype` key is
 * dropped as a NO-OP at EVERY depth, on EITHER side — including inside a subtree that is copied wholesale
 * (present on only one side, or winning a type mismatch) via {@link sanitize}. Walking `Object.keys`/
 * assigning through a plain accumulator never touches the prototype chain, so this cannot pollute
 * `Object.prototype` no matter how deeply the caller nests the poison key or which side carries it. Plain
 * objects recurse key-by-key; arrays/primitives/a type mismatch replace the base value outright at that
 * node (`patch` wins as a whole node, not spliced field-by-field, once it stops being "both sides are
 * plain objects").
 */
export function deepMergeRequestBody(
  base: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(patch)])) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue;
    }
    if (!(key in patch)) {
      merged[key] = sanitize(base[key]);
      continue;
    }
    if (!(key in base)) {
      merged[key] = sanitize(patch[key]);
      continue;
    }
    const baseValue = base[key];
    const patchValue = patch[key];
    merged[key] =
      isPlainObject(baseValue) && isPlainObject(patchValue)
        ? deepMergeRequestBody(baseValue, patchValue)
        : sanitize(patchValue);
  }
  return merged;
}
