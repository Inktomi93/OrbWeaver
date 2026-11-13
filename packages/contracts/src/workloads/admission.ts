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

/** The coded refusal of a run whose account is disabled, whoever asks: a disabled account is treated exactly like a
 *  departed one, so its schedules admit nothing and its queued runs fail rather than spend on its connections. */
export const WORKLOAD_RUN_ACCOUNT_DISABLED = "run_account_disabled";

/** {@link WORKLOAD_RUN_ACCOUNT_DISABLED}'s sentence. A stored run shows it as the failed row's reason. */
export const WORKLOAD_RUN_ACCOUNT_DISABLED_REFUSAL = "This job runs for an account that is disabled.";

/** The coded run-account refusals a schedule's tick can meet, which its list row names. */
export const WORKLOAD_RUN_ACCOUNT_REFUSAL_CODES = [WORKLOAD_RUN_ACCOUNT_NOT_OWNER, WORKLOAD_RUN_ACCOUNT_DISABLED] as const;
export type WorkloadRunAccountRefusalCode = (typeof WORKLOAD_RUN_ACCOUNT_REFUSAL_CODES)[number];

/** Each run-account refusal's sentence, the one a client shows for its code. */
export const WORKLOAD_RUN_ACCOUNT_REFUSAL_SENTENCES: Readonly<Record<WorkloadRunAccountRefusalCode, string>> = {
  [WORKLOAD_RUN_ACCOUNT_NOT_OWNER]: WORKLOAD_RUN_ACCOUNT_REFUSAL,
  [WORKLOAD_RUN_ACCOUNT_DISABLED]: WORKLOAD_RUN_ACCOUNT_DISABLED_REFUSAL,
};

/** The coded failure of a run whose result its kind's schema refuses: the run ended, but this build cannot store what it
 *  produced, so the row fails instead of holding a result no read can publish. */
export const WORKLOAD_RESULT_INVALID = "result_invalid";

/** {@link WORKLOAD_RESULT_INVALID}'s sentence. A stored run shows it as the failed row's reason. */
export const WORKLOAD_RESULT_INVALID_REASON = "This job finished, but its result is not one this build can store.";

/** Missing admitted liability for a generative workload. */
export const WORKLOAD_UNFUNDED = "workload_unfunded";

/** Narrow persisted funding only when a workload requests generative model work. */
export function requireWorkloadFunder(funderUserId: UserId | null): UserId {
  if (funderUserId === null) {
    throw new DomainOperationError(WORKLOAD_UNFUNDED, "This run has no admitted model funder. Start a new run to authorize model work.");
  }
  return funderUserId;
}
