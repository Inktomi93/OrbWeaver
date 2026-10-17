// Native declaration identities shared by tooling readers; no containment judgments.
import type {
  ClassDeclaration,
  ExpressionWithTypeArguments,
  InterfaceDeclaration,
  Symbol as MorphSymbol,
  Node,
  Type,
  TypeAliasDeclaration,
  TypeParameterDeclaration,
  TypeReferenceNode,
  ts,
} from "ts-morph";
import type nativeTs from "typescript";
import type { ReferenceFact } from "./reference-fact-contract.ts";

/** The declaration kinds that can own a generic constructor identity. */
export type GenericDeclaration = InterfaceDeclaration | TypeAliasDeclaration;
const CONTAINMENTS = ["no", "possible", "yes"] as const;
export type Containment = (typeof CONTAINMENTS)[number];

export interface CallMemberDeclarationOrigin {
  readonly name: string | null;
  readonly origin: ReferenceFact<readonly Node[]>;
}

/** Declaration-only native delivery; lexical leaf bindings retain the refusal classifier's own subject. */
export interface NativeCallMemberOrigin extends CallMemberDeclarationOrigin {
  readonly leafDeclarations: readonly Node[];
}

/** One property read whose property SYMBOL the checker resolved off the receiver's type. */
export interface TypeMemberOrigin {
  readonly name: string;
  /** The member access node the read was normalized from (dotted, optional, or computed-literal). */
  readonly access: Node;
  readonly receiver: Node;
  readonly nameNode: Node;
  readonly symbol: MorphSymbol;
  /** Every declaration of the property symbol; an overload set legitimately has more than one. */
  readonly declarations: readonly Node[];
}

/** One property of the CONTEXTUAL type an object literal is being checked against — the identity of a
 *  `{ staleTime: … }` key, which its own literal cannot supply (its symbol declares on the literal). */
export interface ContextualMemberOrigin {
  readonly name: string;
  /** The property assignment the key was read from. */
  readonly assignment: Node;
  readonly nameNode: Node;
  readonly literal: Node;
  readonly symbol: MorphSymbol;
  readonly declarations: readonly Node[];
}

/** A type declaration identity. Resolved-Type readers use the alias symbol when the checker kept one,
 *  otherwise the type's symbol. The value-type query may retain an authored alias identity only when that
 *  reference's resolved type occupies the declared data graph: root/union/intersection types, element/index
 *  types and named data properties. This proves typed containment, not present runtime data or how it is used.
 *  Callable parameters/results and erased reference occurrences do not establish containment, including a
 *  supplied argument erased by a recursively expanding generic. */
export interface TypeIdentityOrigin<Anchor = Node> {
  readonly name: string;
  readonly node: Anchor;
  /** Resolved-Type readers: the name came from the type's alias symbol (`GatedStoreHook<T>`).
   *  Value-type query's authored provenance: the resolved symbol declares a type alias. */
  readonly aliased: boolean;
  readonly declarations: readonly Anchor[];
}

/** A native formal substituted in an actual member/signature slot, paired by declaration identity. */
export interface NativeSubstitutedTypeSlot<ObservedType = Type, Anchor = Node> {
  readonly formal: ObservedType;
  readonly actual: ObservedType;
  readonly declarations: readonly Anchor[];
  readonly projection?: readonly string[];
}

/** Parser-owned raw observations remain in their actual compiler realm; adapters validate identities. */
export interface NativeParserTypeContext {
  readonly kind: "parser";
  readonly program: nativeTs.Program;
  readonly source: nativeTs.SourceFile;
  readonly checker: nativeTs.TypeChecker;
}

/** An explicitly parser-bound observed type; the adapter verifies it against its authored node. */
export interface NativeTypeIdentityGraphInput {
  readonly node: nativeTs.Node;
  readonly rootType: nativeTs.Type;
  readonly parser: NativeParserTypeContext;
}

/** Captured template and actual native types; locations determine the checker’s instantiated symbols. */
export interface NativeSubstitutedTypeInput {
  readonly witnessLocation: Node;
  readonly parameter: TypeParameterDeclaration;
  readonly templateLocation: TypeAliasDeclaration | InterfaceDeclaration | ClassDeclaration;
  readonly actualLocation: TypeReferenceNode | ExpressionWithTypeArguments;
  readonly program: ts.Program;
  readonly source: ts.SourceFile;
}

/** Raw parser observations never become nodes or types from ts-morph's separate compiler realm. */
export interface ParserSubstitutedTypeInput {
  readonly witnessLocation: nativeTs.Node;
  readonly parameter: nativeTs.TypeParameterDeclaration;
  readonly templateLocation: nativeTs.TypeAliasDeclaration | nativeTs.InterfaceDeclaration | nativeTs.ClassDeclaration;
  readonly actualLocation: nativeTs.TypeReferenceNode | nativeTs.ExpressionWithTypeArguments;
  readonly parser: NativeParserTypeContext;
}

export interface TypeRealmGeneric<Anchor> {
  readonly kind: "alias" | "interface" | "class";
  readonly parameters: readonly Anchor[];
  readonly body: Anchor | undefined;
}

export interface TypeRealmMapped<Anchor> {
  readonly parameter: Anchor;
  readonly constraint: Anchor | undefined;
  readonly value: Anchor | undefined;
  readonly remap: Anchor | undefined;
  readonly optional: boolean;
  readonly readonly: boolean;
}

/** Operations preserve each compiler's actual values; canonical algorithms never exchange compiler realms. */
export interface TypeRealmOperations<Anchor extends object, ObservedType, Symbol, Signature, Identity extends object> {
  readonly nodeIdentity: (node: Anchor) => object;
  readonly typeIdentity: (type: ObservedType) => Identity;
  readonly parent: (node: Anchor) => Anchor | undefined;
  readonly children: (node: Anchor) => readonly Anchor[];
  readonly path: (node: Anchor) => string;
  readonly text: (node: Anchor) => string;
  readonly contains: (node: Anchor) => boolean;
  readonly forgotten: (node: Anchor) => boolean;
  readonly identifier: (node: Anchor) => boolean;
  readonly parameter: (node: Anchor) => boolean;
  readonly variable: (node: Anchor) => boolean;
  readonly generic: (node: Anchor) => TypeRealmGeneric<Anchor> | undefined;
  readonly reference: (node: Anchor) => { readonly name: Anchor; readonly arguments: readonly Anchor[] } | undefined;
  readonly mapped: (node: Anchor) => TypeRealmMapped<Anchor> | undefined;
  readonly indexedNode: (node: Anchor) => { readonly object: Anchor; readonly index: Anchor } | undefined;
  readonly operatorType: (node: Anchor) => Anchor | undefined;
  readonly query: (node: Anchor) => Anchor | undefined;
  readonly conditional: (node: Anchor) => { readonly check: Anchor; readonly extends: Anchor; readonly selected: Anchor } | undefined;
  readonly template: (node: Anchor) => { readonly head: string; readonly spans: readonly { readonly type: Anchor; readonly tail: string }[] } | undefined;
  readonly literalNode: (node: Anchor) => string | undefined;
  readonly type: (node: Anchor) => ObservedType;
  readonly symbol: (node: Anchor) => Symbol | undefined;
  readonly alias: (symbol: Symbol) => Symbol;
  readonly declarations: (symbol: Symbol) => readonly Anchor[];
  readonly symbolName: (symbol: Symbol) => string;
  readonly symbolType: (symbol: Symbol, at: Anchor) => ObservedType;
  readonly typeSymbol: (type: ObservedType) => Symbol | undefined;
  readonly aliasSymbol: (type: ObservedType) => Symbol | undefined;
  readonly flags: (type: ObservedType) => {
    readonly any: boolean;
    readonly unknown: boolean;
    readonly never: boolean;
    readonly parameter: boolean;
    readonly object: boolean;
  };
  readonly unions: (type: ObservedType) => readonly ObservedType[];
  readonly intersections: (type: ObservedType) => readonly ObservedType[];
  readonly tuple: (type: ObservedType) => readonly ObservedType[] | undefined;
  readonly element: (type: ObservedType) => ObservedType | undefined;
  readonly indexes: (type: ObservedType) => readonly ObservedType[];
  readonly properties: (type: ObservedType) => readonly Symbol[];
  readonly property: (type: ObservedType, name: string) => Symbol | undefined;
  readonly arguments: (type: ObservedType) => readonly ObservedType[];
  readonly aliasArguments: (type: ObservedType) => readonly ObservedType[];
  readonly nonnullable: (type: ObservedType) => ObservedType;
  readonly awaited: (type: ObservedType) => ObservedType | undefined;
  readonly signatures: (type: ObservedType, kind: "call" | "construct") => readonly Signature[];
  readonly signatureDeclaration: (signature: Signature) => Anchor | undefined;
  readonly signatureParameters: (signature: Signature) => readonly Symbol[];
  readonly signatureReturn: (signature: Signature) => ObservedType;
  readonly indexedType: (identity: Identity) => { readonly object: Identity; readonly key: string } | undefined;
  readonly literalType: (type: ObservedType) => string | undefined;
  readonly assignable: (left: ObservedType, right: ObservedType) => boolean;
  readonly defaultLibrary: (node: Anchor) => boolean;
}

export interface DeclaredCallTerminalSelection {
  readonly packageName: string;
  readonly packageMethods: readonly string[];
  readonly projectHome: string | null;
  readonly projectMethods: readonly string[];
}
