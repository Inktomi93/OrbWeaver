// The final Orb policy descriptor and the capability-bounded context created once per invocation.
import type { Node, SourceFile, TypeChecker } from "ts-morph";
import type { GateFact, GateFactValue } from "./fact.ts";
import type { GateAuthority, GateSeverity } from "./gate-authority.ts";
import type { GatePolicyAnalysis, GatePolicyReceipt, GatePolicyVisitor } from "./policy-primitives.ts";
import type { PopulationExpr } from "./population.ts";
import type { GateResourceRequest } from "./resource-declaration.ts";
import type { ResourceHost } from "./resource-host.ts";

export const GATE_POLICY_EXECUTIONS = ["selected-files", "entire-population"] as const;
export type GatePolicyExecution = (typeof GATE_POLICY_EXECUTIONS)[number];

export const GATE_POLICY_PROOF_MODES = ["source", "types", "resource"] as const;
export type GatePolicyProofMode = (typeof GATE_POLICY_PROOF_MODES)[number];

export interface GatePolicyProofExpectation {
  readonly count?: number;
  /** The MODULE-LEVEL DECLARATION whose cardinality drives this row's finding count (#2001, owner ruling
   *  2026-09-12) — the declared, exact alternative to `count` for the one measured shape where a literal is
   *  the wrong instrument.
   *
   *  A `count` is a PROXY for "this row ratifies its own arm's findings and no other". Where the count is
   *  driven by a registry constant the fixture cannot control (`PORTABLE_CANON_TABLES`, the domain roster,
   *  `registryScriptNames()`), pinning a literal makes a legitimate registry addition a RED PROOF — a rule
   *  whose effect is "classifying a table correctly breaks the build". `countFrom` names the driver instead:
   *  it is an EXACT exemption (the constant is checked to resolve in the policy's own module, by
   *  `verifyPolicyProofs` and by `policy-proof-expectations` ARM C), never free text and never a standing
   *  warning. `count` and `countFrom` are mutually exclusive.
   *
   *  A `countFrom` row still owes a SECOND discriminator (`token` / `line` / `messageIncludes`) — the gate
   *  requires it, deliberately tighter than the ruling, because without one the row asserts nothing at all,
   *  which is strictly worse than the literal it replaces. */
  readonly countFrom?: string;
  readonly line?: number;
  readonly token?: string;
  readonly messageIncludes?: string;
}

/** Explicit fixture substrate and file map; no population-derived path or live-tree anchor exists. */
export interface GatePolicyProof {
  readonly mode: GatePolicyProofMode;
  readonly files: Readonly<Record<string, string>>;
  /** Repo-relative link path → link TARGET, exactly as authored. `resource` mode only.
   *
   *  A symlink is not expressible as text, and the one verdict `authoredPaths` exists to produce — a
   *  selector that reaches OUTSIDE the tree through an in-repo symlink — cannot be proven without one. The
   *  target is deliberately unconstrained: a target that ESCAPES the fixture root is the whole point, and a
   *  proof runtime that refused it could only ever demonstrate the arm that already passes. */
  readonly links?: Readonly<Record<string, string>>;
  readonly expect?: GatePolicyProofExpectation;
  readonly why: string;
}

export interface GatePolicyFindingDetails {
  readonly message?: string;
  readonly fix?: string;
  readonly subject?: string;
  readonly operation?: string;
}

export type GatePolicyNodeFindingDetails = GatePolicyFindingDetails &
  ({ readonly token?: never; readonly offset?: never } | { readonly token: string; readonly offset: number });

export interface GatePolicyFileFindingDetails extends GatePolicyFindingDetails {
  readonly line?: number;
  readonly column?: number;
  readonly token?: string;
}

export interface GatePolicyReportSink {
  /** Node-derived coordinates; the node must belong to the effective source population. */
  readonly node: (node: Node, details?: GatePolicyNodeFindingDetails) => void;
  /** Explicit file/resource anchor; the identity must belong to the effective combined population. */
  readonly file: (path: string, details?: GatePolicyFileFindingDetails) => void;
}

/** The policy-visible surface. Deliberately contains no Project, root, filesystem, parser, or grants. */
export interface GatePolicyContext {
  readonly files: readonly SourceFile[];
  readonly resourcePaths: readonly string[];
  readonly resources: ResourceHost;
  readonly relativePath: (sourceFile: SourceFile) => string;
  readonly sourceFile: (repoRelativePath: string) => SourceFile;
  readonly checker: () => TypeChecker;
  /** Read one declared provider after the shared walk; early or undeclared access refuses. */
  readonly fact: <Fact extends GateFact>(provider: Fact) => GateFactValue<Fact>;
  readonly report: GatePolicyReportSink;
  readonly receipt: (receipt: GatePolicyReceipt) => void;
}

export interface GatePolicyHooks {
  readonly visitors?: readonly GatePolicyVisitor[];
  readonly visitFile?: (sourceFile: SourceFile) => void;
  readonly evaluate?: () => void;
}

interface GatePolicyBase {
  readonly id: string;
  readonly family: string;
  readonly authority: GateAuthority;
  readonly population: PopulationExpr;
  readonly analysis: GatePolicyAnalysis;
  readonly execution: GatePolicyExecution;
  /** Shared providers required by this whole-population policy; `[]` is explicit. */
  readonly facts: readonly GateFact[];
  /** Explicit closed ResourceHost facts; `[]` is required when the policy consumes none. */
  readonly resources: readonly GateResourceRequest[];
  readonly message: string;
  readonly fix?: string;
  readonly create: (context: GatePolicyContext) => GatePolicyHooks;
  readonly mustFlag: readonly GatePolicyProof[];
  readonly mustPass: readonly GatePolicyProof[];
  /** THE REFUSAL ARM (#1977). An input whose CORRECT outcome is neither a finding nor a clean pass, but the
   *  pass REFUSING and withholding the owner — a blindness tripwire firing, a declared resource coming back
   *  broken, a receipt that resolved zero members. `toolFailure` runs BEFORE the arm verdict in
   *  `ops/policy-conformance.ts`, so such an input can be neither `mustFlag` (no finding is reported) nor
   *  `mustPass` (the owner did not succeed): the behaviour was unprovable by construction and every pin for
   *  it lived in a vitest family test, which `tests/tooling/**` being `--full`-only (#1842) keeps off the
   *  static bar `mustFlag`/`mustPass` already run on.
   *
   *  OPTIONAL, because a refusal is not a property every policy HAS — unlike `facts`/`resources`, where `[]`
   *  is a position every author must take. Absent is byte-identical to today.
   *
   *  Each row REQUIRES `expect.messageIncludes` and FORBIDS `count`/`line`/`token`: there are no findings to
   *  count, and a refusal row that does not name the refusal TEXT passes whether the arm fired or is
   *  unreachable — the dead-arm shape this arm exists to make impossible. */
  readonly mustRefuse?: readonly GatePolicyProof[];
}

interface ErrorGatePolicy extends GatePolicyBase {
  readonly severity: Extract<GateSeverity, "error">;
  readonly workItem?: never;
}

interface WarningGatePolicy extends GatePolicyBase {
  readonly severity: Extract<GateSeverity, "warning">;
  /** Positive GitHub issue number owning the warning debt. */
  readonly workItem: number;
}

export type GatePolicy = ErrorGatePolicy | WarningGatePolicy;

const definedPolicies = new WeakSet<object>();
type ExactPolicy<Policy extends GatePolicy> = Policy & Record<Exclude<keyof Policy, keyof GatePolicy>, never>;

/** Brand a direct descriptor without adapting or stripping it; the loader still validates every byte. */
export function defineGate<const Policy extends GatePolicy>(policy: ExactPolicy<Policy>): Policy {
  definedPolicies.add(policy);
  return policy;
}

/** Runtime provenance check used by the auto-loader to refuse structural/legacy lookalikes. */
export function isDefinedGatePolicy(value: unknown): value is GatePolicy {
  return typeof value === "object" && value !== null && definedPolicies.has(value);
}
