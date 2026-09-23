// The shape of `reports/check-structure.json` under the MIXED runtime (docs/design/gate-runtime-standardization.md
// §5 item 2; docs/reviews/gate-runtime/mixed-runtime-front-door.md §3.3) — ONE artifact, ONE roster, read by ONE
// reader (ops/show.ts). Homed in contract/ per the five-slot type law (Core-Tooling-Law.md §2.5): ops/structure.ts
// writes it, ops/show.ts and the suites read it.
//
// `gates[]` is the whole roster and since #2176 Phase F (2026-09-14) it holds ONE row shape: a policy row
// carrying authority, severity, owner completion, population COUNTS, semantic receipts, waived/granted
// tallies and policy-phase timing. The legacy half — `LegacyGateRow`, the top-level `toolErrors`,
// `scanAlarms`, `populationAlarms` and `timing` slots, and `reconciliation.legacyFindings` — retired with
// the dispatcher that wrote it. `contract/show-artifact.ts` keeps loose OPTIONAL views of those fields on
// purpose: it reads HISTORICAL artifacts, which still carry them.
//
// Population is carried as COUNTS, deliberately: 163 policies × ~7,300 paths as lists would make the artifact
// unreadable and `check:show` unusable; the per-policy semantic receipts (members, unresolved) stay whole because
// they ARE the denominator a verdict rests on.
import type {
  AuthorityConsumption,
  GateAuthority,
  GateAuthorityAlarm,
  GateAuthorityToolError,
  GateAuthorityVerdict,
  GateOwnerCompletion,
  GateSeverity,
  UnjudgedReviewedGrant,
} from "./gate-authority.ts";
import type { Violation } from "./harness.ts";
import type { OrdinaryWaiverCarrierRefusal } from "./ordinary-waiver-source.ts";
import type { GateFactOwnerResult, GateFactToolError, PolicyPassTiming, PolicySemanticReceipt, PolicyTiming, PolicyToolError } from "./policy-pass.ts";
import type { RunManifest } from "./run-manifest.ts";

/** THE ARTIFACT'S OWN NAME — the basename inside every run slot AND the basename of the published pointer
 *  (#1029). It is part of this shape's contract, not a per-reader detail, so it is homed beside the shape:
 *  the writer (ops/structure.ts), the reader (ops/show.ts), the delta (ops/structure-delta.ts) and the debt
 *  view (ops/debt.ts) each carried their OWN copy of the literal until 2026-09-12, which is four places a
 *  rename has to land and four chances for a reader to go looking at a path nobody writes. */
export const STRUCTURE_REPORT_NAME = "check-structure.json";

/** A `PolicyPopulationReceipt` reduced to its sizes; `requestedPaths` is null at whole scope. */
export interface PopulationCounts {
  readonly declaredSourcePaths: number;
  readonly declaredResourcePaths: number;
  readonly effectiveSourcePaths: number;
  readonly effectiveResourcePaths: number;
  readonly requestedPaths: number | null;
}

/** One final policy's outcome. `violations` are the EFFECTIVE findings after central waiver/grant reconciliation
 *  (warnings included, each carrying `severity`); `waived`/`granted` are what reconciliation absorbed. `ok` is
 *  false on any blocking finding, a withheld or non-successful owner, or an authority alarm naming this policy. */
export interface FinalPolicyRow {
  readonly contract: "final";
  readonly name: string;
  readonly family: string;
  readonly authority: GateAuthority;
  readonly severity: GateSeverity;
  readonly workItem: number | null;
  readonly ok: boolean;
  readonly owner: GateOwnerCompletion;
  readonly withheld: boolean;
  readonly population: PopulationCounts;
  readonly receipts: readonly PolicySemanticReceipt[];
  readonly violations: readonly Violation[];
  readonly waived: number;
  readonly granted: number;
  readonly timing: PolicyTiming;
}

/** @public knip type-face false positive — a structural field (`gates`) of the exported `StructureReport` shape, never
 *  referenced by its own name at any call site. A single-arm alias since #2176 Phase F: the name is what the
 *  artifact's readers spell, and collapsing it into `FinalPolicyRow` at every call site would be four edits
 *  for the next contract that joins the roster to undo. */
export type StructureGateRow = FinalPolicyRow;

/** One shared fact provider's outcome, population as counts. */
export interface StructureFactRow {
  readonly id: string;
  readonly status: GateFactOwnerResult["status"];
  readonly population: PopulationCounts;
  readonly receipts: readonly PolicySemanticReceipt[];
  readonly timing: GateFactOwnerResult["timing"];
  readonly error: string | null;
}

/** The final side's aggregate — everything `runPolicyPass` returned that is not a per-policy row. */
export interface StructurePolicyReport {
  readonly facts: readonly StructureFactRow[];
  readonly factErrors: readonly GateFactToolError[];
  readonly toolErrors: readonly PolicyToolError[];
  readonly waiverCarrierRefusals: readonly OrdinaryWaiverCarrierRefusal[];
  readonly authority: {
    readonly alarms: readonly GateAuthorityAlarm[];
    readonly unjudgedReviewedGrants: readonly UnjudgedReviewedGrant[];
    readonly toolErrors: readonly GateAuthorityToolError[];
    readonly withheldPolicyIds: readonly string[];
    readonly ordinaryConsumption: readonly AuthorityConsumption[];
    readonly reviewedGrantConsumption: readonly AuthorityConsumption[];
    readonly verdict: GateAuthorityVerdict;
  };
  readonly timing: PolicyPassTiming;
}

/** The arithmetic behind `total`, materialized so an artifact reader can reconcile the headline without
 *  knowing the authority engine's warning/alarm rules. Effective findings include warnings; only warnings
 *  left unpromoted by `failOnWarnings` are subtracted, while every authority alarm adds a blocker. */
export interface StructureCountReconciliation {
  readonly finalEffectiveFindings: number;
  readonly nonblockingWarnings: number;
  readonly authorityAlarms: number;
  readonly blocking: number;
}

/** The artifact. `policy` is null when the corpus resolved no policy at all (a planted empty tree) — every
 *  refusal, alarm and cost ledger lives inside it, which is why nothing sits beside it here any more. */
export interface StructureReport {
  readonly run: RunManifest;
  readonly gates: readonly StructureGateRow[];
  readonly policy: StructurePolicyReport | null;
  readonly reconciliation: StructureCountReconciliation;
  /** BLOCKING effective findings + authority alarms — what exit 1 counts. */
  readonly total: number;
  readonly ok: boolean;
}
