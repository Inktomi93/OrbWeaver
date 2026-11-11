// domain/character/substrate/bulk-tag-result — shared helper for bulk-add/remove-card-tag, pure
// and zero-I/O (the substrate slot — verb files may not import one another's VALUES, `domain-no-cross-verb`).
// Builds the wire-safe `CharacterBulkTagResult` (contracts/character — the ONE home for the shape) from the
// per-item outcomes each verb collects. The domain verbs never surface a raw `Error` on the wire: a
// `DomainOperationError` reads through by its own message, anything else degrades to a fixed fallback.
//
// `BulkTagOutcome` carries `characterId` on EVERY arm (including a failure) rather than zipping a
// `Promise.allSettled` array back against the input by INDEX: a rejected settled result carries only
// `.reason`, so recovering which id failed needs either an index zip (an off-by-one waiting to happen the
// moment one array is filtered before the other) or — this file's choice — each verb catches its OWN
// per-item rejection and returns a discriminated outcome that already names its id.

import type { CharacterBulkTagFailure, CharacterBulkTagResult } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import type { BulkTagOutcome } from "../contract/results.ts";

function classifyBulkTagFailure(reason: unknown): CharacterBulkTagFailure["error"] {
  return { message: reason instanceof Error ? reason.message : "an unexpected error" };
}

/** A fulfilled truthy outcome is `applied`; a fulfilled falsy one (the silent no-op, unchanged from before
 *  this row) lands in neither array; a `failed` outcome is named in `failed`. */
export function buildBulkTagResult(outcomes: readonly BulkTagOutcome[]): CharacterBulkTagResult {
  const applied: CharacterId[] = [];
  const failed: CharacterBulkTagFailure[] = [];
  for (const outcome of outcomes) {
    if ("failed" in outcome) {
      failed.push({ error: classifyBulkTagFailure(outcome.failed) });
    } else if (outcome.applied) {
      applied.push(outcome.characterId);
    }
  }
  return { applied, failed };
}
