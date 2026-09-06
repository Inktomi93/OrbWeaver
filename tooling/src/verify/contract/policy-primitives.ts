// The walk primitives both a policy and a first-class fact declare: the analysis tier, the kind-indexed
// visitor, and the population/resource receipt. A leaf on purpose — `policy.ts` composes facts and
// `fact.ts` is consumed by policies, so the names they share must live below both or the contracts form a cycle.
import type { Node, SourceFile, SyntaxKind } from "ts-morph";

export const GATE_POLICY_ANALYSES = ["syntax", "types", "resource"] as const;
export type GatePolicyAnalysis = (typeof GATE_POLICY_ANALYSES)[number];

export type GatePolicyReceipt =
  | { readonly kind: "population"; readonly source: string; readonly members: number; readonly unresolved?: number }
  | { readonly kind: "resource"; readonly source: string; readonly resources: number; readonly unresolved?: number };

export interface GatePolicyVisitor {
  readonly kinds: readonly SyntaxKind[];
  readonly visit: (node: Node, sourceFile: SourceFile) => void;
}
