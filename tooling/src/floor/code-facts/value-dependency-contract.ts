import type { CallExpression, Node, ts } from "ts-morph";
import type { CallReturnObservations } from "./reference-fact-contract.ts";

/** Neutral value contribution: consumers separately prove the native meaning of supplied terminals. */
export interface ValueDependencyInput {
  readonly value: Node;
  readonly path?: readonly string[];
  readonly observations: CallReturnObservations;
  readonly terminals: ReadonlySet<ts.CallExpression>;
}

export const OPAQUE_NATIVE_VALUE_KINDS = ["any", "unknown"] as const;

export interface OpaqueNativeValueBoundary {
  readonly node: Node;
  readonly kind: (typeof OPAQUE_NATIVE_VALUE_KINDS)[number];
}

export interface ValueDependencyContribution {
  readonly terminal: CallExpression;
  readonly projection: readonly string[];
  readonly uses: readonly Node[];
  readonly opaqueData?: readonly OpaqueNativeValueBoundary[];
}

/** Contribution and data trust are independent; an empty boundary list never proves validation or ownership. */
export type ValueDependencyResult =
  | {
      readonly kind: "qualified";
      readonly contributions: readonly ValueDependencyContribution[];
      readonly dataTrust: { readonly kind: "unqualified"; readonly boundaries: readonly OpaqueNativeValueBoundary[] };
    }
  | { readonly kind: "unqualified"; readonly reason: string; readonly node: Node };
