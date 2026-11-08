// Builds before D340 let a member hold a bare import-st schedule or run, which reads the box owner's operator tree.
// Launched databases still hold them, and the product judges each one at its tick, its dispatch and its retry. The
// box owner creates the run through production, then the row moves to the member, the one column those builds differed on.

import { OPERATOR_TREE_WORKLOAD_KIND } from "@orb/contracts/workloads";
import { workloadSchedules, workloads } from "@orb/db";
import type { UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

const BARE_OPERATOR_RUN = { kind: OPERATOR_TREE_WORKLOAD_KIND, params: {} } as const;

/** The box owner who creates the run, and the member a build before D340 let hold it. */
interface MemberOperatorPeople {
  readonly boxOwnerId: UserId;
  readonly memberId: UserId;
}

/** A paused bare operator-tree schedule held by the member. */
export async function plantMemberOperatorSchedule(root: ServerProducerRoot, people: MemberOperatorPeople): Promise<WorkloadScheduleId> {
  const owner = await root.internalCallerFor(people.boxOwnerId);
  const { id } = await owner.workloads.createSchedule({ input: BARE_OPERATOR_RUN, cadence: "hourly", mode: "singular", enabled: false });
  await root.db.update(workloadSchedules).set({ ownerId: people.memberId }).where(eq(workloadSchedules.id, id));
  return id;
}

/** A cancelled bare operator-tree run under the member, which Retry offers the box owner. Needs a root with no job runner. */
export async function plantMemberOperatorRun(root: ServerProducerRoot, people: MemberOperatorPeople): Promise<WorkloadId> {
  const owner = await root.internalCallerFor(people.boxOwnerId);
  const { id } = await owner.workloads.start({ input: BARE_OPERATOR_RUN, mode: "singular" });
  await owner.workloads.cancel({ id });
  await root.db.update(workloads).set({ ownerId: people.memberId }).where(eq(workloads.id, id));
  return id;
}
