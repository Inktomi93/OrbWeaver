// domain/workloads/substrate/params — the two kind-indexed params helpers the verbs + the read path share.
// NEITHER the schemas NOR the lock partitions are decided here: each kind's validator is its owning domain's
// `WorkloadContribution.params` and each kind's concurrency unit is its `WorkloadContribution.admissionKey`,
// so this file only routes a blob to the right contribution and translates a parse failure into a domain
// error.

import type { StartWorkloadInput, WorkloadKind, WorkloadParamsByKind } from "@orb/contracts/workloads";
import { DEFAULT_ADMISSION_KEY, startWorkloadEnvelope } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { WorkloadContributions } from "../contract/contribution";

/** Parse ONE kind's params blob against its contribution schema. Throws the raw Zod error — callers that
 *  face a client wrap it (`parseWorkloadInput`); the row read path catches it for poison tolerance. */
function parseParamsForKind<K extends WorkloadKind>(contributions: WorkloadContributions, kind: K, params: unknown): WorkloadParamsByKind[K] {
  return contributions[kind].params.parse(params);
}

/**
 * The enqueue door's validation: the envelope (a known kind + a params object) then the OWNING domain's
 * per-kind schema. Defense in depth — the wire already validated the envelope, and mocked-procedure tests
 * bypass it entirely. A malformed params blob is a caller error, so it surfaces as a BAD_REQUEST-mapped
 * domain error rather than an escaping ZodError (which would 500).
 */
export function parseWorkloadInput(contributions: WorkloadContributions, input: StartWorkloadInput): StartWorkloadInput {
  const envelope = startWorkloadEnvelope.parse(input);
  try {
    const params = parseParamsForKind(contributions, envelope.kind, envelope.params);
    return { kind: envelope.kind, params } as StartWorkloadInput;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const invalid = new DomainOperationError("invalid_params", `"${envelope.kind}" params failed validation: ${detail}`);
    invalid.cause = err;
    throw invalid;
  }
}

/**
 * The single-active lock partition a row inserts under. The queue spells NO kind here (D117 — that switch on
 * `kind === "index"` was the last of the junk-drawer's domain knowledge): the OWNING domain declares its
 * concurrency unit as `WorkloadContribution.admissionKey`, and a kind that declares none shares the `none`
 * bucket, which keeps its lock exactly per-(kind, owner) / per-(kind).
 */
export function resolveAdmissionKey<K extends WorkloadKind>(contributions: WorkloadContributions, kind: K, params: WorkloadParamsByKind[K]): string {
  return contributions[kind].admissionKey?.(params) ?? DEFAULT_ADMISSION_KEY;
}

/**
 * The single-active refusal, as a sentence the person who hit it can ACT on. The admission key means a
 * conflict is never "this kind is busy" any more — it is "this exact unit of work is already in flight", so
 * the message names the state AND the two ways out (wait, or cancel the run that holds the slot). The old
 * text (`a "databank-ingest" workload is already active`) named an internal kind and no remedy, and the
 * client had nothing to render but a generic "Couldn't …" toast.
 */
export function activeConflictMessage(kind: WorkloadKind): string {
  return `That "${kind}" run is already in progress — wait for it to finish, or cancel it under Jobs before starting it again.`;
}
