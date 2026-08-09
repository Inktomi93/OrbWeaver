// Boot seed: the CAS maintenance schedules (#11). The `assets-gc` / `assets-fsck` contributions have existed
// since the workloads engine landed, but nothing ever CREATED a schedule row for them — a box would run its
// blob GC and integrity check exactly as often as a human remembered to press the button, which is never.
// This is the seed step that gives a fresh box the ratified cadence: GC weekly, fsck monthly.
//
// MODE IS FORCED, not chosen: both kinds are bulk-only (`WORKLOAD_KIND_MODES` — `singular: false`), because a
// CAS sweep is a whole-store pass, not one user's job. A bulk schedule from a non-null caller would demand the
// box owner; this seed passes `caller: null` (the trusted system trigger, same as every other boot step) and
// stamps the explicit `ownerId` the schedule row's NOT NULL owner column requires.
//
// IDEMPOTENCY — existence-gated, per kind, never overwriting:
// a kind that already has ANY schedule row is left completely alone, so an owner's edits to cadence or
// `enabled` survive every subsequent boot. That is the reason this checks for the KIND rather than for an
// exact (kind, cadence) pair: matching on cadence would treat an owner's retune as "missing" and helpfully
// restore the default beside it. The deliberate tradeoff: an owner who DELETES a schedule outright gets it
// back on next boot — turning maintenance off is `setScheduleEnabled(false)`, which this preserves, and a
// resurrected disabled-able row is a far cheaper failure than a box that silently stops GC'ing its blobs.

import type { ScheduleCadence, WorkloadKind } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import type { WorkloadService } from "#domain/workloads";

export interface SeedCasSchedulesDeps {
  /** The workloads service — only the two schedule verbs this step needs. */
  readonly workloads: Pick<WorkloadService, "createSchedule" | "listSchedules">;
  /** The box owner (the post-`seedOwner` boot phase supplies it), stamped as the schedule row's owner. */
  readonly ownerId: UserId;
}

/** The ratified defaults. Ratification fixes the CADENCE only — the kinds are whatever `domain/assets` raises. */
const CAS_DEFAULT_SCHEDULES = [
  { kind: "assets-gc", cadence: "weekly" },
  { kind: "assets-fsck", cadence: "monthly" },
] as const satisfies readonly { kind: WorkloadKind; cadence: ScheduleCadence }[];

/** Ensure the CAS maintenance schedules exist for the box owner. Idempotent (see the header). */
export async function seedCasSchedules(deps: SeedCasSchedulesDeps): Promise<void> {
  const existing = await deps.workloads.listSchedules({ caller: null, ownerId: deps.ownerId });
  const missing = CAS_DEFAULT_SCHEDULES.filter((spec) => !existing.some((row) => row.kind === spec.kind));
  await Promise.all(
    missing.map(async (spec) => {
      await deps.workloads.createSchedule({
        input: { kind: spec.kind, params: {} },
        caller: null,
        ownerId: deps.ownerId,
        cadence: spec.cadence,
        mode: "bulk",
        enabled: true,
      });
    }),
  );
}
