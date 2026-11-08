import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";

/** The owning contribution refused admission before creating a workload row. */
export const WORKLOAD_NOT_ADMISSIBLE = "not_admissible";

/** Why a run that only the box owner may reach was refused to the person asking. */
export const WORKLOAD_OWNER_ONLY_REFUSAL = "Only the box owner can run this job.";

/** The coded refusal of an owner-only run whose account is not the box owner, whoever asks. A stored run, a schedule
 *  and a retry all meet it, and the client keys on this code, never on the message. */
export const WORKLOAD_RUN_ACCOUNT_NOT_OWNER = "run_account_not_owner";

/** {@link WORKLOAD_RUN_ACCOUNT_NOT_OWNER}'s sentence. A stored run shows it as the failed row's reason. */
export const WORKLOAD_RUN_ACCOUNT_REFUSAL = "This job runs for an account that is not the box owner, and only the box owner can run it.";

/** Missing admitted liability for a generative workload. */
export const WORKLOAD_UNFUNDED = "workload_unfunded";

/** Narrow persisted funding only when a workload requests generative model work. */
export function requireWorkloadFunder(funderUserId: UserId | null): UserId {
  if (funderUserId === null) {
    throw new DomainOperationError(WORKLOAD_UNFUNDED, "This run has no admitted model funder. Start a new run to authorize model work.");
  }
  return funderUserId;
}
