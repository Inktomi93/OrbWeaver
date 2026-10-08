// The internal protocol between the affected-instrument stage and the real-corpus liveness entries.
// An absent value means the whole roster: direct suite runs, `tests:tooling`, and every full-tier proof
// therefore retain the complete corpus. Only ops/instrument-affected.ts may mint a narrowed policy list,
// after its source graph has proved which gate modules the changed sources reach.
import type { NativeNodeShard } from "./scoped-test.ts";

export const INSTRUMENT_AFFECTED_POLICIES_ENV = "ORB_INSTRUMENT_AFFECTED_POLICIES";

interface InstrumentAffectedLivenessFullScope {
  readonly kind: "full";
  readonly reason: string;
}

interface InstrumentAffectedLivenessPolicyScope {
  readonly kind: "policies";
  readonly policyIds: readonly string[];
}

export type InstrumentAffectedLivenessScope = InstrumentAffectedLivenessFullScope | InstrumentAffectedLivenessPolicyScope;

export interface InstrumentAffectedArm {
  readonly policy: { readonly id: string };
}

export interface InstrumentAffectedPolicyReach {
  readonly policyIds: readonly string[];
  readonly unclassifiableGatePaths: readonly string[];
}

interface InstrumentAffectedSelectionFields {
  readonly sources: readonly string[];
  readonly specs: readonly string[];
  readonly unreachedSources: readonly string[];
  readonly delegatedTests: readonly string[];
}

export type InstrumentAffectedSelection = InstrumentAffectedSelectionFields &
  (
    | { readonly unknown: true; readonly livenessScope: InstrumentAffectedLivenessFullScope }
    | { readonly unknown: false; readonly livenessScope: InstrumentAffectedLivenessScope }
  );

export const INSTRUMENT_EXECUTION_COMPONENTS = ["all", "non-corpus", "corpus"] as const;
export type InstrumentExecutionComponent = (typeof INSTRUMENT_EXECUTION_COMPONENTS)[number];
export const INSTRUMENT_EXECUTION_COMPONENT_ENV = "ORB_VERIFY_INSTRUMENT_COMPONENT";

export interface InstrumentExecution {
  readonly component: InstrumentExecutionComponent;
  readonly shard: NativeNodeShard | undefined;
}
