import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";

/** The owning contribution refused admission before creating a workload row. */
export const WORKLOAD_NOT_ADMISSIBLE = "not_admissible";

/** Missing admitted liability for a generative workload. */
export const WORKLOAD_UNFUNDED = "workload_unfunded";

/** Narrow persisted funding only when a workload requests generative model work. */
export function requireWorkloadFunder(funderUserId: UserId | null): UserId {
  if (funderUserId === null) {
    throw new DomainOperationError(WORKLOAD_UNFUNDED, "This run has no admitted model funder. Start a new run to authorize model work.");
  }
  return funderUserId;
}
