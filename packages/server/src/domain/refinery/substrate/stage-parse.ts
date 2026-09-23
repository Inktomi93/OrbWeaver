// domain/refinery/substrate/stage-parse — the ONE model-output parse seam every stage inherits
// (security pass §4.4-4.6). Two belts, composed per call:
//   • `dropNullValues` BEFORE validation (§3.B): under the D126 `strict-compatible` projection, optional
//     fields arrive as explicit `null` and would fail `z.number().optional()` — every rewrite run dead on
//     that deployment. The kit function is safe to run unconditionally (its own docstring).
//   • the STRIPPED-KEY itemization (§1 gap 5): zod strip-mode silently removes unknown keys, so an
//     invented key must be DIFFED back out of the pre-parse capture and recorded on the run row — paths
//     only, never values (zod messages quote model output; the structured-turn header's law).
// The capture is taken AFTER the null-drop, DELIBERATELY: an explicit null under strict-compatible is
// the projection's own encoding of ABSENT (protocol-normal), not an invented key — itemizing it would
// stamp stripped keys onto EVERY legitimate run on that deployment and drown the tamper signal in
// noise. Only keys the SCHEMA refused to know are itemized.
// The capture is PER-CALL state (build a fresh parse per run) — a module-cached capture would pool one
// call's payload onto another's (the per-turn-sink lesson).

import { dropNullValues } from "@orb/contracts/inference";
import { z } from "zod";
import type { StageParse } from "../contract/prompts.ts";

/** Wrap one stage's payload schema with the null-drop + capture belts. Fresh per call (header). */
export function buildStageParse<T>(payloadSchema: z.ZodType<T>): StageParse<T> {
  let captured: unknown;
  const schema: z.ZodType<T> = z.preprocess((value) => {
    const dropped = dropNullValues(value);
    captured = dropped;
    return dropped;
  }, payloadSchema);
  return {
    schema,
    strippedKeysOf: (parsed: T): readonly string[] => diffKeyPaths(captured, parsed),
  };
}

/** Every dotted path present in `input` but absent from `output` — the keys the strip-mode parse removed.
 *  Arrays recurse positionally (`fields.0.junk`); non-object leaves diff by presence only (a VALUE the
 *  schema coerced is not a stripped KEY).
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function diffKeyPaths(input: unknown, output: unknown): readonly string[] {
  const stripped: string[] = [];
  walk(input, output, "", stripped);
  return stripped;
}

function walk(input: unknown, output: unknown, prefix: string, out: string[]): void {
  if (Array.isArray(input)) {
    walkArray(input, output, prefix, out);
    return;
  }
  if (input === null || typeof input !== "object") {
    return;
  }
  const outObj = output !== null && typeof output === "object" && !Array.isArray(output) ? (output as Record<string, unknown>) : undefined;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (outObj === undefined || !(key in outObj)) {
      out.push(path);
      continue;
    }
    walk(value, outObj[key], path, out);
  }
}

/** The positional array arm of {@link walk} (`fields.0.junk`). */
function walkArray(input: readonly unknown[], output: unknown, prefix: string, out: string[]): void {
  if (!Array.isArray(output)) {
    return;
  }
  for (let i = 0; i < input.length; i += 1) {
    walk(input[i], output[i], prefix === "" ? String(i) : `${prefix}.${i}`, out);
  }
}
