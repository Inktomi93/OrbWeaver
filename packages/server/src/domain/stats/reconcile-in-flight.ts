// domain/stats/reconcile-in-flight — the per-user SINGLE-FLIGHT gate for the awaited `stats.reconcile` verb
// (owner ruling 2026-08-02): a caller with a recompute in flight must not start another; it WAITS for the
// running one. The direct path has no cancel by design, so the honest answer to a second click (or a second
// tab) is a refusal, not a second full rebuild-from-canon racing the first over the same rollup rows.
//
// ASSUMES(single-replica): a process-local `Set<UserId>` — the `chat/active-turns.ts` / workloads
// progress-bus posture. This is NOT a gap the queue already covers: the workloads single-active lock is a DB
// row guarding the `reconcile-stats` WORKLOAD path, and the direct verb never enters the queue, so no db
// state exists to gate on. A db table for a guard whose whole lifetime is one in-request await would be
// durable state that can only ever go stale (a crash mid-rebuild would strand the flag). A multi-replica
// deploy would need a shared lock (a doorway, not built).
//
// The slot releases in a `finally` — a THROWING rebuild must not wedge the owner out of ever recomputing.

import { DomainConflictError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { ReconcileInFlight } from "./contract/reconcile-in-flight.ts";

/** The refusal copy — honest and actionable: there is nothing to do but wait for the running pass. */
const ALREADY_RUNNING = "a recompute is already running";

/** Build the registry. Pure process state — no clock, no db, no I/O (built once per service, at compose). */
export function createReconcileInFlight(): ReconcileInFlight {
  const running = new Set<UserId>();

  // The claim is synchronous (check + add before the first await), so two calls in the same tick can never
  // both pass the gate — the refusal is deterministic, not a timing accident.
  async function run<T>(ownerId: UserId, task: () => Promise<T>): Promise<T> {
    if (running.has(ownerId)) {
      throw new DomainConflictError(ALREADY_RUNNING);
    }
    running.add(ownerId);
    try {
      return await task();
    } finally {
      running.delete(ownerId);
    }
  }

  return { run, isRunning: (ownerId): boolean => running.has(ownerId) };
}
