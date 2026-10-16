// One closed capture owns scalar Type/Symbol relationships; no checker object survives publication.
import type { Node, SourceFile } from "ts-morph";
import type { NativePrimitiveFlags, NativeScalarTypeSelections, NativeTypeSelector } from "./type-projection-contract.ts";

export const TYPE_OBSERVATION_PROFILE = "authored-type-slots-v1";
export const ZOD_OUTPUT_PROPERTY = "_output";
export const TYPE_OBSERVATION_VALUE_FACETS = ["module", "global", "binding", "string", "stable", "authored-value"] as const;
export const TYPE_OBSERVATION_QUESTION_KINDS = [
  "node-types",
  "primitive-flags",
  "literal-values",
  "property-symbols",
  "const-initializers",
  "declaration-closure",
  "type-properties",
  "definition-nodes",
  "definition-closure",
  "call-parameters",
  "signature-parameters",
  "symbol-values",
  "value-profiles",
  "type-details",
  "function-exports",
  "symbol-closure",
  "reference-closure",
] as const;
export interface TypeObservationQuestion<Anchor = Node> {
  readonly kind: (typeof TYPE_OBSERVATION_QUESTION_KINDS)[number];
  readonly nodes: readonly Anchor[];
  readonly files?: readonly string[] | undefined;
  readonly properties?: readonly string[] | undefined;
  /** Exact zero-argument property-call receiver questions inside the admitted declaration closure. */
  readonly receiverMethods?: readonly string[] | undefined;
  readonly valueFacets?: readonly (typeof TYPE_OBSERVATION_VALUE_FACETS)[number][] | undefined;
}

export interface TypeObservationDemand<Anchor = Node> {
  readonly profile: typeof TYPE_OBSERVATION_PROFILE;
  readonly sources: readonly Anchor[];
  readonly nodes: readonly Anchor[];
  readonly questions?: readonly TypeObservationQuestion<Anchor>[] | undefined;
}
/** Value questions require the existing binding/computed children in this same native capture. */
export function hasTypeObservationValueDemand(demand: TypeObservationDemand<object> | undefined): boolean {
  return demand?.questions?.some((question) => question.valueFacets !== undefined) === true;
}

/** Exact const cohorts carry their lexical records; every existing callback-dependent question stays complete. */
export function typeObservationNeedsSourceBindings(demand: TypeObservationDemand<object> | undefined): boolean {
  return (
    demand?.questions?.some(
      (question) =>
        question.valueFacets !== undefined &&
        (question.kind !== "const-initializers" || question.valueFacets.some((facet) => facet !== "module" && facet !== "global")),
    ) === true
  );
}

/** Numeric references are local to this exact capture/world/generation, never declaration or display substitutes. */
export interface NativeObservedSymbol<Anchor = Node> {
  readonly name: string;
  readonly declarations: readonly Anchor[];
  readonly canonical: number;
  readonly valueDeclaration?: Anchor | null | undefined;
}

export type NativeTypeObservation<Value> = { readonly kind: "unrequested" } | { readonly kind: "absent" } | { readonly kind: "value"; readonly value: Value };

export interface NativeObservedType {
  readonly symbol: number | null;
  readonly aliasSymbol: number | null;
  readonly never: boolean;
  readonly typeParameter: boolean;
  readonly unionCount: number;
  readonly tupleCount: number;
  readonly primitiveFlags?: NativePrimitiveFlags | undefined;
  readonly stringLiteral?: string | null | undefined;
  readonly defaultDisplay?: string | undefined;
  readonly literalValue?: NativeTypeObservation<ObservedLiteralValue> | undefined;
  readonly typeArguments?: readonly number[] | undefined;
  readonly typeArgumentCount?: number | undefined;
}

export type ObservedLiteralValue = string | number | boolean | { readonly negative: boolean; readonly base10Value: string };

export interface NativeObservedNode<Anchor = Node> {
  readonly node: Anchor;
  readonly symbol: number | null;
  readonly type: number;
  readonly contextual: NativeTypeObservation<number>;
}

export interface NativeObservedSignature<Anchor = Node> {
  readonly call: Anchor;
  readonly fact: NativeTypeObservation<{ readonly declaration: Anchor; readonly parameters: readonly number[] }>;
}

export interface NativeObservedDependency<Anchor = Node> {
  readonly type: number;
  readonly owner: Anchor;
  readonly at: Anchor;
  readonly witness: Anchor | null;
}

export interface TypeObservationValues<Anchor = Node> {
  readonly anchor: Anchor;
  readonly demand: TypeObservationDemand<Anchor>;
  readonly symbols: readonly NativeObservedSymbol<Anchor>[];
  readonly nodes: readonly NativeObservedNode<Anchor>[];
  readonly constInitializers?: readonly { readonly node: Anchor; readonly values: readonly Anchor[] }[] | undefined;
  readonly types: readonly (NativeObservedType | null)[];
  readonly properties: readonly {
    readonly selector: number;
    readonly at: Anchor;
    readonly values: readonly { readonly name: string; readonly symbol: number; readonly type: number }[];
  }[];
  readonly unions: readonly { readonly selector: number; readonly values: readonly number[] }[];
  readonly callReturns: readonly { readonly node: Anchor; readonly values: readonly number[] }[];
  readonly computedNames: readonly {
    readonly selector: number;
    readonly values: readonly { readonly declaration: Anchor; readonly names: readonly Anchor[] }[];
  }[];
  readonly signatures: readonly NativeObservedSignature<Anchor>[];
  readonly propertySymbols?: readonly { readonly selector: number; readonly name: string; readonly symbol: number | null }[] | undefined;
  readonly definitions?: readonly { readonly node: Anchor; readonly values: readonly Anchor[] }[] | undefined;
  readonly functionExports?: readonly { readonly node: Anchor; readonly value: boolean }[] | undefined;
  readonly callParameters?: readonly { readonly call: Anchor; readonly parameterCount: number | null; readonly values: readonly number[] | null }[] | undefined;
  readonly signatureParameters?:
    | readonly {
        readonly selector: number;
        readonly at: Anchor;
        readonly parameterCounts: readonly number[];
        readonly values: readonly (readonly number[])[];
      }[]
    | undefined;
  readonly valueProfiles?: readonly { readonly node: Anchor; readonly facets: readonly (typeof TYPE_OBSERVATION_VALUE_FACETS)[number][] }[] | undefined;
  readonly dependencies: readonly NativeObservedDependency<Anchor>[];
  readonly localTargets: readonly { readonly node: Anchor; readonly symbol: number | null }[];
  readonly exports: readonly {
    readonly source: Anchor;
    readonly symbols: readonly number[];
    readonly default: number | null;
    readonly localTargets: readonly number[];
  }[];
  readonly selections: NativeScalarTypeSelections<Anchor> | null;
}
export interface NativeTypeObservations extends TypeObservationValues {
  readonly anchor: SourceFile;
  readonly assertNode: (node: Node) => void;
}

export interface TypeObservationCaptureOwner {
  readonly anchor: SourceFile;
  readonly admit: (node: Node) => void;
  readonly profile?: ((node: Node, facets: readonly (typeof TYPE_OBSERVATION_VALUE_FACETS)[number][]) => void) | undefined;
  readonly references?: ((node: Node) => readonly Node[]) | undefined;
}

export interface TypeObservationCaptureRequest {
  readonly demand: TypeObservationDemand;
  readonly references?: TypeObservationCaptureOwner["references"];
}

/** Handles are scalar references into an explicit capture, not compiler Type/Symbol facades. */
export const OBSERVATION_REFERENCE_KINDS = ["type", "symbol"] as const;
export interface ObservedReference<Kind extends (typeof OBSERVATION_REFERENCE_KINDS)[number] = (typeof OBSERVATION_REFERENCE_KINDS)[number]> {
  readonly kind: Kind;
  readonly scope: object;
  readonly index: number;
}
export interface ObservedSymbolData {
  readonly key: object;
  readonly name: string;
  readonly declarations: readonly Node[];
  readonly canonical: ObservedReference<"symbol">;
}
export interface ObservedTypeData {
  readonly key: object;
  readonly any: boolean;
  readonly unknown: boolean;
  readonly never: boolean;
  readonly typeParameter: boolean;
  readonly unionCount: number;
  readonly tupleCount: number;
  readonly symbol: ObservedReference<"symbol"> | null;
  readonly aliasSymbol: ObservedReference<"symbol"> | null;
}
export interface ObservedProperty {
  readonly name: string;
  readonly symbol: ObservedReference<"symbol">;
  readonly selector: NativeTypeSelector;
}
export interface ObservedSignature {
  readonly declaration: Node;
  readonly parameters: readonly NativeTypeSelector[];
}

/** Only registered node/selector operations may be answered by a delivered reader. */
export interface TypeObservationReader {
  readonly select: (selector: NativeTypeSelector) => ObservedReference<"type"> | null;
  readonly type: (reference: ObservedReference<"type">) => ObservedTypeData;
  readonly symbol: (node: Node) => ObservedReference<"symbol"> | null;
  readonly symbolData: (reference: ObservedReference<"symbol">) => ObservedSymbolData;
  readonly exports: (source: SourceFile) => readonly ObservedReference<"symbol">[];
  readonly defaultExport: (source: SourceFile) => ObservedReference<"symbol"> | null;
  readonly localTarget: (node: Node) => ObservedReference<"symbol"> | null;
  readonly properties: (selector: NativeTypeSelector, at: Node) => readonly ObservedProperty[];
  readonly unions: (selector: NativeTypeSelector) => readonly NativeTypeSelector[];
  readonly callReturns: (node: Node) => readonly NativeTypeSelector[];
  readonly signature: (call: Node) => ObservedSignature | null;
  readonly depends: (selector: NativeTypeSelector, owner: Node, at: Node) => Node | null;
  readonly relation: (left: NativeTypeSelector, right: NativeTypeSelector) => import("./assignability-contract.ts").TypeRelation | null;
  readonly display: (selector: NativeTypeSelector, at: Node) => string | null;
  readonly computedNames: (selector: NativeTypeSelector) => readonly { readonly declaration: Node; readonly names: readonly Node[] }[];
  readonly primitiveFlags: (selector: NativeTypeSelector) => NativePrimitiveFlags;
  readonly propertySymbol: (selector: NativeTypeSelector, name: string) => ObservedReference<"symbol"> | null;
  readonly definitions: (node: Node) => readonly Node[];
  readonly callParameters: (call: Node) => readonly NativeTypeSelector[] | null;
  readonly signatureParameters: (selector: NativeTypeSelector, at: Node) => readonly (readonly NativeTypeSelector[])[];
  readonly literal: (selector: NativeTypeSelector) => string | null;
  readonly valueDeclaration: (symbol: ObservedReference<"symbol">) => Node | null;
  readonly defaultDisplay: (selector: NativeTypeSelector) => string;
  readonly literalValue: (selector: NativeTypeSelector) => ObservedLiteralValue | undefined;
  readonly typeArguments: (selector: NativeTypeSelector) => readonly NativeTypeSelector[];
  readonly functionExport: (node: Node) => boolean;
}

export interface TypeObservationCapture {
  readonly reader: TypeObservationReader;
  readonly finish: (demand: TypeObservationDemand, values?: TypeObservationValues["valueProfiles"]) => NativeTypeObservations;
}
