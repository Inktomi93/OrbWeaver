// domain/workloads/engine/reap-record — the ONE sentence dispatch every `worker_died` stamp draws from, and
// the boot-respawn bound one of those sentences names.
//
// WHY A SHARED LEAF (#560 + #543). TWO engines terminal a row with `worker_died`: the steady-state `reaper`
// sweep and the boot `boot-reclaim` disposition. They stamp the SAME status, and `markTerminal` overwrites
// `updatedAt` — the lease column — with the reap instant, so the `error` STRING is the row's only surviving
// evidence of which death it was. One shared `assertNever` dispatch over `WorkloadReapReason` is what keeps
// those sentences from collapsing back into one indistinguishable line (which is exactly what a forensics
// lane had to work around for the 08-22 long-pass deaths). It lives in its own module rather than inside
// either engine because both import it and neither may import the other: the bound below is the boot
// reclaim's branch condition AND the text of the loop sentence, so co-locating them in `reaper.ts` or
// `boot-reclaim.ts` would buy a module cycle.
//
// The sweep only ever declares `heartbeat_stale` (a live process, a lease past its grace window); the boot
// reclaim declares `worker_restart` for an orphan it cannot re-queue and `respawn_loop` for one that burned
// the bound. Adding a member to the union fails tsc HERE first.

import type { WorkloadReapReason } from "../contract/service.ts";

/** How many progress-free boot respawns a row may take before the reclaim gives up on it. Three is a real
 *  bound rather than a round one: two consecutive respawns are routine on this box (a merge landing while a
 *  sweep runs, then the operator restarting), and a row that has burned three boots without emitting a
 *  single progress snapshot is not making any. */
export const MAX_BOOT_RESPAWNS = 3;

function assertNever(value: never): never {
  throw new Error(`unreachable workload reap reason: ${String(value)}`);
}

/** One sentence per reason — `assertNever`-exhaustive (§5.5 dispatch discipline; a switch rather than a keyed
 *  Record because the reason vocabulary is snake_case, matching `WorkloadError.kind`), so a new
 *  `WorkloadReapReason` fails tsc here rather than silently inheriting another death's wording.
 *  `leaseAgeMs` is `now - updatedAt` observed BEFORE the terminal stamp overwrites that column. */
export function reapedMessage(reason: WorkloadReapReason, leaseAgeMs: number): string {
  switch (reason) {
    case "heartbeat_stale":
      return `worker heartbeat went stale — row reaped (worker_died); lease was ${leaseAgeMs}ms old at the sweep`;
    case "worker_restart":
      return `the server restarted while this row was in flight — reclaimed at boot (worker_died); lease was ${leaseAgeMs}ms old at the restart`;
    case "respawn_loop":
      return `respawned ${MAX_BOOT_RESPAWNS} times across process restarts without reporting progress — reaped (worker_died) rather than re-queued again; lease was ${leaseAgeMs}ms old at the restart`;
    default:
      return assertNever(reason);
  }
}
