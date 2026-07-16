// domain/buddy/contract/agent-env — the buddy's cross-feature HANDS seam (mirrors `WorkloadRunnerEnv`).
// `domain/buddy` must NOT import `domain/workloads` (`domain-no-cross-feature`), so the composition root
// (`entry/`) assembles this typed bundle from the workloads front door and injects it. Uses only
// LOCAL/kit types — no cross-feature type import — so the coupling stays type-thin ("lite shapes").

import type { UserId, WorkloadId } from "@orb/kit/ids";

/** The maintenance jobs the buddy is allowed to PROPOSE — a curated subset of the workloads domain's
 *  `WorkloadKind`. FLAG(reconcile): when `domain/workloads` lands its `WorkloadKind` axis, confirm this
 *  curated subset is a true member set (it stays buddy-local + lite — the buddy never carries the full
 *  workload taxonomy). */
export type BuddyWorkloadKind = "find-duplicates" | "index";

/** The injected cross-feature op the `confirm`→workload arm calls. `ownerId` scopes the queued job to
 *  the buddy's owner (borrowed-owner posture). Throws (a kit `DomainConflictError`) when a job of that
 *  kind is already running (single-active) — `confirm` catches it into a friendly `detail`. */
export interface BuddyAgentEnv {
  readonly startWorkload: (args: { readonly ownerId: UserId; readonly kind: BuddyWorkloadKind }) => Promise<{ readonly workloadId: WorkloadId }>;
}
