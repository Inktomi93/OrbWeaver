// runner: memory-backfill — INERT P5 stub. FLAG[PD-41]: the memory digest/segment backfill body →
// domain/memory when the chat/memory build lands (D38 P5 seam; built WHOLE, D16). The kind, its schema, this
// runner, and the RUNNERS entry all exist so `exhaustive-dispatch` stays green — but NO work runs yet; it
// returns a `DeferredResult` (`{ deferred: true }`) so a consumer can tell an inert run from a real
// zero-work pass. The `ctx.env.memory` seam is declared (contract/runner-env); it is wired + called in P5.

import type { Runner } from "../contract/runner";

export const memoryBackfillRunner: Runner<"memory-backfill"> = (_ctx, _params, report, _signal) => {
  report({ message: "memory backfill deferred to P5 (no-op)" });
  return Promise.resolve({ deferred: true });
};
