// One closed capture owns scalar Type/Symbol relationships; no checker object survives publication.

import type { Node, SourceFile } from "ts-morph";
import type { CallableDeclaration, ModuleMemberOrigin, ReferenceFact } from "./reference-fact-contract.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import type { NativePrimitiveFlags, NativeScalarTypeSelections, NativeTypeSelector } from "./type-projection-contract.ts";

export const TYPE_OBSERVATION_PROFILE = "authored-type-slots-v1";
export const ZOD_OUTPUT_PROPERTY = "_output";
export const TYPE_OBSERVATION_VALUE_FACETS = [
  "module",
  "global",
  "drizzle-value-sources",
  "binding",
  "string",
  "stable",
  "authored-value",
  "reference-writes",
  "authored-composite",
  "type-projection",
] as const;
export const TYPE_OBSERVATION_QUESTION_KINDS = [
  "browser-contracts",
  "mount-signatures",
  "ct-mounting",
  "ct-contributions",
  "node-types",
  "primitive-flags",
  "literal-values",
  "property-symbols",
  "const-initializers",
  "drizzle-predicate-inputs",
  "declaration-closure",
  "type-properties",
  "type-constituents",
  "shape-constituents",
  "definition-nodes",
  "node-symbols",
  "definition-closure",
  "call-parameters",
  "signature-parameters",
  "symbol-values",
  "value-profiles",
  "type-details",
  "function-exports",
  "symbol-closure",
  "reference-closure",
  "selected-property-graph",
  "callable-body-values",
] as const;
export interface SelectedPropertyGraph {
  readonly exportName?: string | undefined;
  readonly rootPath: readonly string[];
  readonly stopPath: readonly string[];
  readonly leafPaths: readonly (readonly string[])[];
}
export interface ObservedCategoryFlags {
  readonly object: boolean;
  readonly void: boolean;
}
export interface TypeObservationQuestion<Anchor = Node> {
  readonly kind: (typeof TYPE_OBSERVATION_QUESTION_KINDS)[number];
  readonly nodes: readonly Anchor[];
  readonly files?: readonly string[] | undefined;
  readonly relationTargets?: readonly InventorySpan[] | undefined;
  readonly callableHomes?: readonly { readonly name: string; readonly suffix: string }[] | undefined;
  readonly predicateContext?: { readonly calls: readonly Anchor[]; readonly references: readonly Anchor[] } | undefined;
  readonly properties?: readonly string[] | undefined;
  /** Closure questions only: members whose literal values are read on each closure call's own Type. */
  readonly callLiteralMembers?: readonly string[] | undefined;
  /** Closure questions only: members whose presence is read on each closure value node's receivers. */
  readonly presenceMembers?: readonly string[] | undefined;
  /** Closure questions only, and required there: declaration hops walked past the nominated roots (D328). */
  readonly closureHops?: number | undefined;
  /** Closure questions only: a hop walks a multi-statement function body only from a handler position (a call
   *  argument or a bare alias initializer); every other such body is past the bound. */
  readonly closureHandlerBodiesOnly?: boolean | undefined;
  /** Closure questions only: Type details are asked only at reader positions (`readerTypedPosition`); a Type
   *  question about any other walked node is past the bound. */
  readonly closureTypedPositions?: boolean | undefined;
  /** Exact zero-argument property-call receiver questions inside the admitted declaration closure. */
  readonly receiverMethods?: readonly string[] | undefined;
  readonly valueFacets?: readonly (typeof TYPE_OBSERVATION_VALUE_FACETS)[number][] | undefined;
  readonly selectedPropertyGraph?: SelectedPropertyGraph | undefined;
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
        ((question.kind !== "const-initializers" && question.kind !== "drizzle-predicate-inputs") ||
          question.valueFacets.some((facet) => facet !== "module" && facet !== "global" && facet !== "drizzle-value-sources")),
    ) === true
  );
}

const COMPLETE_PROPERTY_QUESTION_KINDS: readonly string[] = ["type-properties", "selected-property-graph"];

/** Complete native member requests retain their native arity, including a real empty answer. */
export function hasCompleteTypePropertyDemand<Anchor>(demand: TypeObservationDemand<Anchor>): boolean {
  return demand.questions?.some((question) => COMPLETE_PROPERTY_QUESTION_KINDS.includes(question.kind)) === true;
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
  readonly intersectionCount?: number | undefined;
  readonly unionCount: number;
  readonly tupleCount: number;
  readonly primitiveFlags?: NativePrimitiveFlags | undefined;
  readonly categoryFlags?: ObservedCategoryFlags | undefined;
  readonly stringLiteral?: string | null | undefined;
  readonly defaultDisplay?: string | undefined;
  readonly literalValue?: NativeTypeObservation<ObservedLiteralValue> | undefined;
  readonly typeArguments?: readonly number[] | undefined;
  readonly typeArgumentCount?: number | undefined;
}

export type ObservedLiteralValue = string | number | boolean | { readonly negative: boolean; readonly base10Value: string };

/** A node's symbol. Its Type is a separate, explicitly requested selector: resolving a symbol never types the node. */
export interface NativeObservedNode<Anchor = Node> {
  readonly node: Anchor;
  readonly symbol: number | null;
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
  readonly predicateInputs?: readonly { readonly node: Anchor; readonly predicates: readonly Anchor[]; readonly values: readonly Anchor[] }[] | undefined;
  readonly constInitializers?: readonly { readonly node: Anchor; readonly values: readonly Anchor[] }[] | undefined;
  readonly types: readonly (NativeObservedType | null)[];
  readonly properties: readonly {
    readonly selector: number;
    readonly at: Anchor;
    readonly propertyCount?: number | undefined;
    readonly values: readonly { readonly name: string; readonly symbol: number; readonly type: number }[];
  }[];
  readonly arrayElements?:
    | readonly { readonly selector: number; readonly array: boolean; readonly readonlyArray: boolean; readonly value: number | null }[]
    | undefined;
  readonly unions: readonly { readonly selector: number; readonly values: readonly number[] }[];
  readonly intersections?: readonly { readonly selector: number; readonly values: readonly number[] }[] | undefined;
  readonly constraints?: readonly { readonly selector: number; readonly value: number | null }[] | undefined;
  readonly signatureDeclarations?:
    | readonly { readonly selector: number; readonly kind: "call" | "construct"; readonly declarationCount: number; readonly declarations: readonly Anchor[] }[]
    | undefined;
  readonly callReturns: readonly { readonly node: Anchor; readonly values: readonly number[] }[];
  readonly computedNames: readonly {
    readonly selector: number;
    readonly values: readonly { readonly declaration: Anchor; readonly names: readonly Anchor[] }[];
  }[];
  readonly signatures: readonly NativeObservedSignature<Anchor>[];
  readonly propertySymbols?: readonly { readonly selector: number; readonly name: string; readonly symbol: number | null }[] | undefined;
  readonly exportDeclarations?: readonly { readonly source: Anchor; readonly name: string; readonly declarations: readonly Anchor[] | null }[] | undefined;
  readonly callableBodies?: readonly { readonly node: Anchor; readonly body: Anchor | null }[] | undefined;
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
  readonly predicateInputs?: ((node: Node) => PredicateInputValues) | undefined;
  readonly profile?: ((node: Node, facets: readonly (typeof TYPE_OBSERVATION_VALUE_FACETS)[number][]) => void) | undefined;
  readonly references?: ((node: Node) => readonly Node[]) | undefined;
  readonly callableDeclaration?: ((node: Node) => ReferenceFact<CallableDeclaration>) | undefined;
  readonly module?: ((node: Node) => ReferenceFact<ModuleMemberOrigin>) | undefined;
  readonly node?: ((span: InventorySpan) => Node) | undefined;
  /** Receives each declaration a bounded closure reached but did not walk. */
  readonly closureBound?: ((declaration: Node) => void) | undefined;
  /** Receives each node a bounded closure walked, and whether its Type details were asked. */
  readonly closureWalked?: ((node: Node, typed: boolean) => void) | undefined;
}

/** A Type question about a node that lies past a bounded closure's frontier: an unresolved answer, not a defect. */
export class ClosureBoundError extends Error {
  readonly node: Node;
  readonly declaration: Node;
  constructor(node: Node, declaration: Node) {
    super(
      `native Type question lies past the bounded closure: ${node.getKindName()} ${node.getSourceFile().getFilePath()}:${String(node.getStartLineNumber())}`,
    );
    this.node = node;
    this.declaration = declaration;
  }
}

export interface TypeObservationCaptureRequest {
  readonly drizzleSources?:
    | {
        readonly declarations: ReadonlySet<string>;
        readonly basis: import("./drizzle-inventory-contract.ts").InventorySchemaBasis | null;
        readonly tables?: readonly import("./schema-identity-contract.ts").SchemaIdentityTable[] | undefined;
      }
    | undefined;
  readonly demand: TypeObservationDemand;
  readonly references?: TypeObservationCaptureOwner["references"];
  readonly node?: TypeObservationCaptureOwner["node"];
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
/** One bounded `shape-constituents` walk node; `truncated` marks a depth or cycle stop whose children were not read. */
export interface ShapeConstituent {
  readonly type: ObservedTypeData;
  readonly primitive: boolean;
  readonly unions: readonly ShapeConstituent[];
  readonly intersections: readonly ShapeConstituent[];
  readonly typeArguments: readonly ShapeConstituent[];
  readonly truncated: boolean;
}
/** A callee's declaration and, per declared parameter, whether its type is an unresolved type parameter. */
export interface ShapeDeclaredSignature {
  readonly declaration: Node;
  readonly generic: readonly boolean[];
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

export interface PredicateInputValues {
  readonly predicates: readonly Node[];
  readonly values: readonly Node[];
}

export interface ObservedArrayElement {
  readonly array: boolean;
  readonly readonlyArray: boolean;
  readonly element: NativeTypeSelector | null;
}

/** Only registered node/selector operations may be answered by a delivered reader. */
export interface TypeObservationReader {
  /** The unwalked declaration past a bounded closure that contains `node`, when no answer about it was captured.
   *  Absent on the live capture reader, which answers every node. */
  readonly closureFrontier?: (node: Node) => Node | undefined;
  /** The statement around `node` when a bounded closure was walked and never reached `node`; absent live. */
  readonly closurePast?: (node: Node) => Node | undefined;
  readonly select: (selector: NativeTypeSelector) => ObservedReference<"type"> | null;
  readonly type: (reference: ObservedReference<"type">) => ObservedTypeData;
  readonly symbol: (node: Node) => ObservedReference<"symbol"> | null;
  readonly symbolData: (reference: ObservedReference<"symbol">) => ObservedSymbolData;
  readonly exports: (source: SourceFile) => readonly ObservedReference<"symbol">[];
  readonly defaultExport: (source: SourceFile) => ObservedReference<"symbol"> | null;
  readonly localTarget: (node: Node) => ObservedReference<"symbol"> | null;
  readonly properties: (selector: NativeTypeSelector, at: Node) => readonly ObservedProperty[];
  readonly unions: (selector: NativeTypeSelector) => readonly NativeTypeSelector[];
  readonly intersections: (selector: NativeTypeSelector) => readonly NativeTypeSelector[];
  readonly constraint: (selector: NativeTypeSelector) => NativeTypeSelector | null;
  readonly signatureDeclarations: (selector: NativeTypeSelector, kind: "call" | "construct") => readonly Node[];
  readonly callReturns: (node: Node) => readonly NativeTypeSelector[];
  readonly signature: (call: Node) => ObservedSignature | null;
  readonly depends: (selector: NativeTypeSelector, owner: Node, at: Node) => Node | null;
  readonly relation: (left: NativeTypeSelector, right: NativeTypeSelector) => import("./assignability-contract.ts").TypeRelation | null;
  readonly display: (selector: NativeTypeSelector, at: Node) => string | null;
  readonly computedNames: (selector: NativeTypeSelector) => readonly { readonly declaration: Node; readonly names: readonly Node[] }[];
  readonly primitiveFlags: (selector: NativeTypeSelector) => NativePrimitiveFlags;
  readonly categoryFlags: (selector: NativeTypeSelector) => ObservedCategoryFlags;
  readonly exportDeclarations: (source: SourceFile, name: string) => readonly Node[] | null;
  /** Null is the canonical reader's absence of a unique authored body, never an unrequested answer. */
  readonly callableBody: (node: Node) => Node | null;
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
  readonly predicateInputs: (node: Node) => PredicateInputValues;
  readonly arrayElement: (selector: NativeTypeSelector) => ObservedArrayElement;
}

export interface TypeObservationCapture {
  readonly reader: TypeObservationReader;
  readonly finish: (demand: TypeObservationDemand, values?: TypeObservationValues["valueProfiles"]) => NativeTypeObservations;
}
