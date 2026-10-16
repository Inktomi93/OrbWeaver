// Type-free canonical value, row, write and helper observations; consumers retain all permission judgments.
import type { CallExpression, Node } from "ts-morph";
import type { NativeTypeVocabulary } from "./type-projection-contract.ts";

export const VALUE_OBSERVATION_FACETS = ["stored-value", "row-column", "drizzle-write", "indexed-parameters"] as const;
export type ValueObservationFacet = (typeof VALUE_OBSERVATION_FACETS)[number];

export type ProjectedStoredValueShape<Anchor = Node> =
  | { readonly kind: "empty" | "sql" | "unresolved" | "typed"; readonly node: Anchor; readonly type: NativeTypeVocabulary }
  | {
      readonly kind: "binding" | "call" | "choice";
      readonly node: Anchor;
      readonly type: NativeTypeVocabulary;
      readonly values: readonly ProjectedStoredValueShape<Anchor>[];
    }
  | { readonly kind: "object"; readonly node: Anchor; readonly type: NativeTypeVocabulary; readonly members: readonly ProjectedStoredValueMember<Anchor>[] };
export type ProjectedStoredValueMember<Anchor = Node> =
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "spread"; readonly value: ProjectedStoredValueShape<Anchor> }
  | { readonly kind: "computed" | "other" };

export type NativeColumnRowObservation<Anchor = Node> =
  | {
      readonly kind: "refused";
      readonly node: Anchor;
      readonly message: string;
      readonly column: { readonly property: string | null; readonly row: Anchor; readonly ambiguous: boolean };
    }
  | {
      readonly kind: "resolved";
      readonly column: { readonly property: string | null; readonly row: Anchor; readonly ambiguous: boolean } | null;
      readonly table: Anchor | null;
      readonly declarations: readonly Anchor[];
    };

export interface NativeColumnObservation {
  readonly vocabulary: NativeTypeVocabulary;
  readonly origin: NativeColumnRowObservation;
}
export interface NativeValueObservationReaders {
  readonly storedValue: (node: Node) => ProjectedStoredValueShape;
  readonly drizzleWrite: (node: Node) => import("./reference-fact-contract.ts").ReferenceFact<import("./drizzle-columns.ts").DrizzleWrite | null>;
  readonly columnRow: (node: Node) => NativeColumnObservation;
  readonly indexedParameters: (node: CallExpression) => readonly import("./drizzle-column-read-contract.ts").IndexedCallParameters[];
}
