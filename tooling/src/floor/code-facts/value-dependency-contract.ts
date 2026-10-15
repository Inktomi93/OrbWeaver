import type { CallExpression, Node, ts } from "ts-morph";
import type { CallReturnObservations } from "./reference-fact-contract.ts";

/** Neutral value contribution: consumers separately prove the native meaning of supplied terminals. */
export interface ValueDependencyInput {
  readonly nativeValueTransfers?: true;
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

export interface ReturnedDictionaryInput {
  readonly bindings?: ReadonlyMap<Node, Node>;
  readonly value: Node;
  readonly observations: CallReturnObservations;
}

export interface ReturnedDictionaryWrite {
  readonly keys: readonly string[];
  readonly key: Node;
  readonly value: Node;
  readonly statement: Node;
  readonly optional: boolean;
}

/** Closed possible keys, not guaranteed presence, evaluated terminals or trusted metadata. */
export type ReturnedDictionaryResult =
  | {
      readonly kind: "qualified";
      readonly binding: Node;
      readonly returned: Node;
      readonly keys: readonly string[];
      readonly writes: readonly ReturnedDictionaryWrite[];
      readonly vocabularyOrigins: readonly Node[];
      readonly dataTrust: { readonly kind: "unqualified" };
    }
  | { readonly kind: "unqualified"; readonly reason: string; readonly node: Node };
