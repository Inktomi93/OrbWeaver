// The final Orb policy descriptor and the capability-bounded context created once per invocation.
import type { Node, SourceFile, SyntaxKind, TypeChecker } from "ts-morph";
import type { GateAuthority, GateSeverity } from "./gate-authority.ts";
import type { PopulationExpr } from "./population.ts";
import type { GateResourceRequest } from "./resource-declaration.ts";
import type { ResourceHost } from "./resource-host.ts";

export const GATE_POLICY_ANALYSES = ["syntax", "types", "resource"] as const;
export type GatePolicyAnalysis = (typeof GATE_POLICY_ANALYSES)[number];

export const GATE_POLICY_EXECUTIONS = ["selected-files", "entire-population"] as const;
export type GatePolicyExecution = (typeof GATE_POLICY_EXECUTIONS)[number];

export const GATE_POLICY_PROOF_MODES = ["source", "types", "resource"] as const;
export type GatePolicyProofMode = (typeof GATE_POLICY_PROOF_MODES)[number];

export interface GatePolicyProofExpectation {
  readonly count?: number;
  readonly line?: number;
  readonly token?: string;
  readonly messageIncludes?: string;
}

/** Explicit fixture substrate and file map; no population-derived path or live-tree anchor exists. */
export interface GatePolicyProof {
  readonly mode: GatePolicyProofMode;
  readonly files: Readonly<Record<string, string>>;
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

export type GatePolicyReceipt =
  | { readonly kind: "population"; readonly source: string; readonly members: number; readonly unresolved?: number }
  | { readonly kind: "resource"; readonly source: string; readonly resources: number; readonly unresolved?: number };

export interface GatePolicyReportSink {
  /** Node-derived coordinates; the node must belong to the effective source population. */
  readonly node: (node: Node, details?: GatePolicyNodeFindingDetails) => void;
  /** Explicit file/resource anchor; the identity must belong to the effective combined population. */
  readonly file: (path: string, details?: GatePolicyFileFindingDetails) => void;
}

export interface GateSharedFactLease<Value> {
  readonly value: Value;
  /** True only for the first consumer over this exact invocation population. */
  readonly collect: boolean;
}

/** The policy-visible surface. Deliberately contains no Project, root, filesystem, parser, or grants. */
export interface GatePolicyContext {
  readonly files: readonly SourceFile[];
  readonly resourcePaths: readonly string[];
  readonly resources: ResourceHost;
  readonly relativePath: (sourceFile: SourceFile) => string;
  readonly sourceFile: (repoRelativePath: string) => SourceFile;
  readonly checker: () => TypeChecker;
  /** Invocation-local shared derivation; shared reader modules own keys and collection visitors. */
  readonly sharedFact: <Value>(key: object, create: () => Value) => GateSharedFactLease<Value>;
  readonly report: GatePolicyReportSink;
  readonly receipt: (receipt: GatePolicyReceipt) => void;
}

export interface GatePolicyVisitor {
  readonly kinds: readonly SyntaxKind[];
  readonly visit: (node: Node, sourceFile: SourceFile) => void;
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
  /** Explicit closed ResourceHost facts; `[]` is required when the policy consumes none. */
  readonly resources: readonly GateResourceRequest[];
  readonly message: string;
  readonly fix?: string;
  readonly create: (context: GatePolicyContext) => GatePolicyHooks;
  readonly mustFlag: readonly GatePolicyProof[];
  readonly mustPass: readonly GatePolicyProof[];
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
