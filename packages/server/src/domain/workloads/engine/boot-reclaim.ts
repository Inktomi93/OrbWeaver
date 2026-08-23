// domain/workloads/engine/boot-reclaim — `reclaimInFlightOnBoot`: the SINGLE-REPLICA boot disposition of
// every in-flight row a dead process left behind. Distinct from the steady-state `reaper` on purpose:
//
//   • the REAPER runs against a LIVE process. A stale heartbeat there means "probably dead", so re-queueing
//     would risk a second concurrent run of a job whose worker is merely wedged — it stays terminal-only.
//   • THIS runs once, at boot, before the worker loop starts. Single replica means no worker survived, so
//     every in-flight row is orphaned BY DEFINITION and re-queueing cannot double-run anything.
//
// WHY IT EXISTS (#529): a respawn is the NORMAL case here, not a catastrophe — `node --watch` re-execs the
// server on any watched-source write, which a merge, a manual restart and a gate fixture plant all trigger
// (three worker-kills by that one mechanism in a single day). Marking every orphan `worker_died` meant a
// multi-hour resumable backfill could not survive ANY respawn. A kind that DECLARES itself re-runnable
// (`WorkloadContribution.resume !== "none"` — the honest resumability contract in @orb/contracts/workloads)
// now goes back to `queued` instead, and the worker picks it up moments later.
//
// THE BOUND is what keeps that from being an unbounded crash loop: a row boot has already re-queued
// MAX_BOOT_RESPAWNS times WITHOUT the run reporting progress in between goes terminal with that reason. The
// counter lives on the row (`workloads.respawns`) and is zeroed by the lease UPDATE whenever a run reports a
// progress snapshot — so "3 respawns" means three respawns that produced nothing, while a job that is
// genuinely making progress can be respawned indefinitely.
//
// The engine spells no domain here: the only thing it reads off a kind is the `resume` axis every
// contribution declares. A kind absent from the registry (deploy skew) takes the conservative arm — nothing
// in this build can say whether re-running it is safe, so it is reaped exactly as before.

import type { WorkloadError, WorkloadKind } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import type { WorkloadId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { WorkloadContributions } from "../contract/contribution.ts";
import type { BootReclaimReport } from "../contract/service.ts";
import { findInFlightForBootReclaim, markTerminal, requeueInFlight } from "../persistence/queries.ts";
import { emitWorkloadEvent } from "./progress-bus.ts";

/** How many progress-free boot respawns a row may take before the reclaim gives up on it. Three is a real
 *  bound rather than a round one: two consecutive respawns are routine on this box (a merge landing while a
 *  sweep runs, then the operator restarting), and a row that has burned three boots without emitting a
 *  single progress snapshot is not making any. */
const MAX_BOOT_RESPAWNS = 3;

const NOT_RESUMABLE_MESSAGE = "orphaned by a process restart and its kind is not resumable — row reaped (worker_died)";
const LOOPED_MESSAGE = `respawned ${MAX_BOOT_RESPAWNS} times across process restarts without reporting progress — reaped (worker_died) rather than re-queued again`;

/** The three things that can happen to one orphan. `unmoved` is the status-guard losing: the row left the
 *  in-flight states between the enumeration and the write (it cannot happen at boot — nothing else is
 *  running yet — but the guard is what makes that true rather than assumed). */
const DISPOSITIONS = ["requeued", "reaped", "unmoved"] as const;
type Disposition = (typeof DISPOSITIONS)[number];

/** Stamp one orphan terminal + emit, exactly as the steady-state reaper does. */
async function reapOrphan(db: Db, args: { id: WorkloadId; kind: WorkloadKind; now: number; message: string }): Promise<Disposition> {
  const moved = await markTerminal(db, { id: args.id, status: "worker_died", error: args.message, now: args.now });
  if (!moved) {
    return "unmoved";
  }
  const error: WorkloadError = { kind: "worker_died", message: args.message };
  emitWorkloadEvent({ type: "failed", workloadId: args.id, kind: args.kind, at: args.now, error });
  return "reaped";
}

/** Put one orphan back in the queue + emit the status transition (the `status` arm of `WorkloadEvent`, whose
 *  first producer this is — a reconnecting client within the replay TTL sees the row go back to `queued`
 *  rather than silently changing under it). */
async function requeueOrphan(db: Db, args: { id: WorkloadId; kind: WorkloadKind; now: number }): Promise<Disposition> {
  if (!(await requeueInFlight(db, { id: args.id, now: args.now }))) {
    return "unmoved";
  }
  emitWorkloadEvent({ type: "status", workloadId: args.id, kind: args.kind, at: args.now, status: "queued" });
  return "requeued";
}

/**
 * Dispose of every orphaned in-flight row at boot: re-queue the resumable ones (bounded), reap the rest.
 * There is no lease threshold — see `findInFlightForBootReclaim` for why the heartbeat is not evidence here.
 */
export async function reclaimInFlightOnBoot(args: { db: Db; contributions: WorkloadContributions; now: number }): Promise<BootReclaimReport> {
  const orphans = await findInFlightForBootReclaim(args.db);
  const dispositions = await Promise.all(
    orphans.map(async (row): Promise<Disposition> => {
      // `Object.hasOwn`, not a truthiness read: the registry is a mapped type over the kind tuple, so tsc
      // believes every lookup hits — only a deploy-skew row (a kind this build dropped) can miss, and it
      // must miss LOUDLY rather than crash on `.resume` of undefined.
      if (!Object.hasOwn(args.contributions, row.kind)) {
        return await reapOrphan(args.db, { id: row.id, kind: row.kind, now: args.now, message: NOT_RESUMABLE_MESSAGE });
      }
      if (args.contributions[row.kind].resume === "none") {
        return await reapOrphan(args.db, { id: row.id, kind: row.kind, now: args.now, message: NOT_RESUMABLE_MESSAGE });
      }
      if (row.respawns >= MAX_BOOT_RESPAWNS) {
        return await reapOrphan(args.db, { id: row.id, kind: row.kind, now: args.now, message: LOOPED_MESSAGE });
      }
      return await requeueOrphan(args.db, { id: row.id, kind: row.kind, now: args.now });
    }),
  );
  const report: BootReclaimReport = {
    requeued: dispositions.filter((disposition) => disposition === "requeued").length,
    reaped: dispositions.filter((disposition) => disposition === "reaped").length,
  };
  getLog().info(report, "workloads: boot reclaim of orphaned in-flight rows (resumable kinds re-queued, the rest reaped)");
  return report;
}
