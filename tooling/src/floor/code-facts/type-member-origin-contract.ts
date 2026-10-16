// Native declaration identities shared by tooling readers; no containment judgments.
import type {
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
export interface TypeIdentityOrigin {
  readonly name: string;
  readonly node: Node;
  /** Resolved-Type readers: the name came from the type's alias symbol (`GatedStoreHook<T>`).
   *  Value-type query's authored provenance: the resolved symbol declares a type alias. */
  readonly aliased: boolean;
  readonly declarations: readonly Node[];
}

/** A native formal substituted in an actual member/signature slot, paired by declaration identity. */
export interface NativeSubstitutedTypeSlot {
  readonly formal: Type;
  readonly actual: Type;
  readonly declarations: readonly Node[];
}

/** Captured template and actual native types; locations determine the checker’s instantiated symbols. */
export interface NativeSubstitutedTypeInput {
  readonly parameter: TypeParameterDeclaration;
  readonly templateLocation: TypeAliasDeclaration | InterfaceDeclaration;
  readonly actualLocation: TypeReferenceNode | ExpressionWithTypeArguments;
  readonly program: ts.Program;
  readonly source: ts.SourceFile;
}

export interface DeclaredCallTerminalSelection {
  readonly packageName: string;
  readonly packageMethods: readonly string[];
  readonly projectHome: string | null;
  readonly projectMethods: readonly string[];
}
