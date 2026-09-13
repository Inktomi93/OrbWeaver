// The shape of `reports/check-structure.json` under the MIXED runtime (docs/design/gate-runtime-standardization.md
// §5 item 2; docs/reviews/gate-runtime/mixed-runtime-front-door.md §3.3) — ONE artifact, ONE roster, read by ONE
// reader (ops/show.ts). Homed in contract/ per the five-slot type law (Core-Tooling-Law.md §2.5): ops/structure.ts
// writes it, ops/show.ts and the suites read it.
//
// `gates[]` is the whole roster: every row carries `contract`, and the two contracts carry their OWN vocabularies —
// a legacy row is today's `GateResult` (file scan denominator, phase timing), a final row carries authority,
// severity, owner completion, population COUNTS, semantic receipts, waived/granted tallies and policy-phase timing.
// Nothing here adapts one contract to the other's fields; a reader that wants a denominator reads `scan` on a legacy
// row and `population`/`receipts` on a final row.
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
} from "./gate-authority.ts";
import type { GateResult, Violation } from "./harness.ts";
import type { OrdinaryWaiverCarrierRefusal } from "./ordinary-waiver-source.ts";
import type { PassTiming, PopulationAlarm, ToolError } from "./pass.ts";
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

/** Today's legacy row, discriminated. */
export interface LegacyGateRow extends GateResult {
  readonly contract: "legacy";
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
 *  referenced by its own name at any call site. */
export type StructureGateRow = LegacyGateRow | FinalPolicyRow;

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
    readonly toolErrors: readonly GateAuthorityToolError[];
    readonly withheldPolicyIds: readonly string[];
    readonly ordinaryConsumption: readonly AuthorityConsumption[];
    readonly reviewedGrantConsumption: readonly AuthorityConsumption[];
    readonly verdict: GateAuthorityVerdict;
  };
  readonly timing: PolicyPassTiming;
}

/** The artifact. `policy` is null when the corpus holds no final policy (a planted legacy-only tree). */
export interface StructureReport {
  readonly run: RunManifest;
  readonly gates: readonly StructureGateRow[];
  /** Legacy tool errors (a descriptor hook that threw). The final side's are in `policy`. */
  readonly toolErrors: readonly ToolError[];
  /** Legacy gates that ran and read NOTHING — a blind checker, judged only at real-tree scope. */
  readonly scanAlarms: readonly string[];
  /** Legacy declared SEMANTIC-MEMBER populations that came back empty or unresolved (#946). */
  readonly populationAlarms: readonly PopulationAlarm[];
  /** The legacy pass's own cost ledger (#1107); the final pass's is `policy.timing`. */
  readonly timing: PassTiming;
  readonly policy: StructurePolicyReport | null;
  /** Legacy violations + final BLOCKING effective findings + authority alarms — what exit 1 counts. */
  readonly total: number;
  readonly ok: boolean;
}
