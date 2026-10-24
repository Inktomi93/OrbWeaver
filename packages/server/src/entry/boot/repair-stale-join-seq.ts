// Boot step: clamp every stale seat join floor to its own room's canon head. Chat owns the statement
// (`repairStaleJoinSeq`); a floor above the head hides history the member was admitted to. Idempotent.

import type { DatabaseHandle } from "@orb/db/wiring";
import { repairStaleJoinSeq } from "#domain/chat";
import { getLog } from "#foundation/observability";

export interface RepairStaleJoinSeqDeps {
  readonly db: DatabaseHandle;
}

/** Clamp stale join_seq values to the per-chat canon head. Returns the count of repaired rows. */
export async function repairStaleJoinSeqOnBoot(deps: RepairStaleJoinSeqDeps): Promise<number> {
  const repaired = await repairStaleJoinSeq(deps.db);
  if (repaired > 0) {
    getLog().info({ repaired }, "boot/repair-stale-join-seq: clamped %d participant(s) with stale join_seq to per-chat canon head (#2253)");
  }
  return repaired;
}
