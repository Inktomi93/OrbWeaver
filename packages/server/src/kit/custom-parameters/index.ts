// The Layer-2 prototype-pollution defense: `deepMergeRequestBody`. Layer 1 (contracts/preset schema
// superRefine) rejects `constructor`/`prototype` at the boundary; this is the runtime merge-time check
// every runner overlay must route through — the two-layer invariant is only real once both sides exist.
// A caller that skips this and spreads customParameters directly is back to Layer-1-only.

import { isPlainObject } from "@orb/kit/guards";

// A literal copy of contracts/preset's forbidden-key set, not an import — avoids coupling Layer 2 to
// Layer 1's internal constant. The sole prototype-pollution attack surface in a plain-object merge.
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

// Deep-strip FORBIDDEN_KEYS from a value copied wholesale (present on only one side, or winning a type
// mismatch) — a subtree that skips the key-by-key merge loop still needs its own poison keys scrubbed.
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
 * Recursively merge `patch` onto `base` — second argument wins at any leaf/type-mismatch (the caller
 * encodes its own precedence by argument order). Any `__proto__`/`constructor`/`prototype` key is dropped
 * as a no-op at every depth, on either side, including inside a subtree copied wholesale via
 * {@link sanitize}. Plain objects recurse key-by-key; arrays/primitives/a type mismatch replace the base
 * value outright at that node.
 */
export function deepMergeRequestBody(base: Readonly<Record<string, unknown>>, patch: Readonly<Record<string, unknown>>): Record<string, unknown> {
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
    merged[key] = isPlainObject(baseValue) && isPlainObject(patchValue) ? deepMergeRequestBody(baseValue, patchValue) : sanitize(patchValue);
  }
  return merged;
}
