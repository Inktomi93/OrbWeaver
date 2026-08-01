// domain/workloads/substrate/params — the two kind-indexed params helpers the verbs + the read path share.
// The SCHEMAS are not here: each kind's validator is its owning domain's `WorkloadContribution.params`, so
// this file only routes a blob to the right contribution and translates a parse failure into a domain error.

import type { StartWorkloadInput, WorkloadKind, WorkloadParamsByKind, WorkloadSource } from "@orb/contracts/workloads";
import { NON_INDEX_SOURCE, startWorkloadEnvelope } from "@orb/contracts/workloads";
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

/** The single-active lock partition a row inserts under: `index`'s own embed source, else the shared
 *  `none` sentinel. The `source` column is a LOCK dimension owned by the queue (admission), which is why the
 *  one kind that sub-partitions it is named here rather than on the contribution. */
export function resolveWorkloadSource<K extends WorkloadKind>(kind: K, params: WorkloadParamsByKind[K]): WorkloadSource {
  return kind === "index" ? (params as WorkloadParamsByKind["index"]).source : NON_INDEX_SOURCE;
}
