// domain/chat/substrate/runtime-variables — the D46 RUNTIME-PLANE cache derivation. The runtime variable state
// is the deterministic FOLD (`foldVarOps`) of each message's SELECTED-variant `variable_delta`, seq-ordered
// along the swipe chain (D26). It is materialized on `chats.runtime_variables` for O(1) reads and RECOMPUTED on
// every mutating event (turn commit / swipe select / delete / fork / move-reorder) — derive-don't-stamp, so a swipe/fork
// rewinds by re-folding (a swipe never clobbers a value a later turn stamped). This file owns the fold-composition and
// `persistence/runtime-variables.ts` the cache writes, so the four mutators share ONE home (never diverge).

import type { VarOp } from "@orb/kit/macro";
import { foldVarOps } from "@orb/kit/macro";

/** The minimal fold input — a message's `seq` + the delta its selected variant applied. Structural so the
 *  `loadVariableDeltas` row (which also carries `messageId` for the mutators' override/filter) satisfies it. */
interface DeltaEntry {
  readonly seq: number;
  readonly delta: readonly VarOp[];
}

/** Fold seq-ordered per-message deltas into the runtime variable state (the `chats.runtime_variables` shape).
 *  Sorts by `seq` defensively (the query already orders, but a caller may splice an appended entry). */
export function foldChain(entries: readonly DeltaEntry[]): Record<string, string> {
  const ordered = entries.toSorted((a, b) => a.seq - b.seq);
  return foldVarOps(ordered.map((e) => e.delta));
}
