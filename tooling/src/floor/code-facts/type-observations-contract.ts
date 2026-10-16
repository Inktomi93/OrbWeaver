// One closed capture owns scalar Type/Symbol relationships; no checker object survives publication.
import type { Node, SourceFile } from "ts-morph";
import type { NativeScalarTypeSelections, NativeTypeSelector } from "./type-projection-contract.ts";

export const TYPE_OBSERVATION_PROFILE = "authored-type-slots-v1";
export const ZOD_OUTPUT_PROPERTY = "_output";

export interface TypeObservationDemand<Anchor = Node> {
  readonly profile: typeof TYPE_OBSERVATION_PROFILE;
  readonly sources: readonly Anchor[];
  readonly nodes: readonly Anchor[];
}

/** Numeric references are local to this exact capture/world/generation, never declaration or display substitutes. */
export interface NativeObservedSymbol<Anchor = Node> {
  readonly name: string;
  readonly declarations: readonly Anchor[];
  readonly canonical: number;
}

export type NativeTypeObservation<Value> = { readonly kind: "unrequested" } | { readonly kind: "absent" } | { readonly kind: "value"; readonly value: Value };

export interface NativeObservedType {
  readonly symbol: number | null;
  readonly aliasSymbol: number | null;
  readonly never: boolean;
  readonly typeParameter: boolean;
  readonly unionCount: number;
  readonly tupleCount: number;
}

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
}

export interface TypeObservationCapture {
  readonly reader: TypeObservationReader;
  readonly finish: (demand: TypeObservationDemand) => NativeTypeObservations;
}
