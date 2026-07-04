// domain/chat/substrate/variables — the D46 CONFIG-PLANE resolution (ChoiceBlock picks → concrete env map).
// Replicates neo's `assembly/context.ts` algorithm VERBATIM, with ONE correctness upgrade: the `randomPick`
// branch draws from the INJECTED turn PRNG (never ambient `Math.random` — orbweaver's determinism law forbids
// entropy on the eval path). Pure + isomorphic (no db, no I/O) — reused by BOTH the assembly env seed (full
// resolution, `withRandomPick: true`, resolved ONCE before assembly) AND the merged `getVariables` read
// (`withRandomPick: false` — a STABLE display of effective values, no per-read variance).

import type { ChoiceBlockSpec } from "@orb/contracts/preset";

/** Resolution mode. `withRandomPick: false` skips the multiSelect+randomPick draw so the merged `getVariables`
 *  read is stable (the config picker shows a fixed effective value, not a fresh random each poll). */
interface ResolveOptions {
  readonly withRandomPick: boolean;
}

/**
 * Resolve the chat's stored ChoiceBlock picks against the preset's declared variables into the concrete
 * `{{name}}→value` map the macro engine sees (D46 config plane). Per declared variable, in order:
 *  1. default fallback — `resolved = (stored pick if a non-empty string) else (defaultValue ?? options[0].value ?? "")`.
 *     An empty-string pick counts as UNPICKED (falls back).
 *  2. randomPick — ONLY when `withRandomPick && multiSelect && randomPick && resolved`: split `resolved` on the
 *     variable's `separator`, trim, drop empties, pick ONE via the injected `prng` (a float in `[0,1)`).
 *  3. multiSelect && !randomPick — the already-`separator`-joined stored string passes through unchanged.
 *  4. orphan-preserve — stored keys with NO declared variable survive (defensive against a preset edit that
 *     drops a variable mid-chat).
 */
export function resolveChoiceVariables(
  specs: readonly ChoiceBlockSpec[],
  stored: Record<string, string>,
  prng: () => number,
  opts: ResolveOptions,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of specs) {
    const fallback = spec.defaultValue ?? spec.options[0]?.value ?? "";
    const picked = stored[spec.name];
    let resolved = typeof picked === "string" && picked.length > 0 ? picked : fallback;
    if (opts.withRandomPick && spec.multiSelect && spec.randomPick && resolved.length > 0) {
      const parts = resolved
        .split(spec.separator)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length > 0) {
        const idx = Math.floor(prng() * parts.length);
        resolved = parts[idx] ?? resolved;
      }
    }
    out[spec.name] = resolved;
  }
  // Orphan-preserve: a stored pick whose declared variable was removed from the preset still survives.
  for (const [key, value] of Object.entries(stored)) {
    if (!(key in out)) {
      out[key] = value;
    }
  }
  return out;
}
