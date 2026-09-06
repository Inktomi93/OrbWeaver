// The closed vocabulary returned by the final spelling-independent binding/reference reader.
import type { Identifier, Symbol as MorphSymbol, Node, SourceFile } from "ts-morph";

const REFERENCE_UNRESOLVED_REASONS = ["unsupported", "dynamic", "write", "cycle", "ambiguous", "missing"] as const;

export type ReferenceUnresolvedReason = (typeof REFERENCE_UNRESOLVED_REASONS)[number];

/** The proof path for a reference fact, ordered from the queried binding toward its terminal origin. */
interface ReferenceTrace {
  readonly declarations: readonly Node[];
  readonly origin: Node;
}

export interface ResolvedReferenceFact<T> {
  readonly kind: "resolved";
  readonly value: T;
  readonly trace: ReferenceTrace;
}

export interface UnresolvedReferenceFact {
  readonly kind: "unresolved";
  readonly reason: ReferenceUnresolvedReason;
  readonly detail: string;
  readonly node: Node;
  readonly trace: ReferenceTrace;
}

/** A positive value with its proof, or one precise refusal. Absence is never a reader verdict. */
export type ReferenceFact<T> = ResolvedReferenceFact<T> | UnresolvedReferenceFact;

/** One property read, normalized across dotted, optional, and computed-literal spellings. */
export interface MemberReference {
  readonly name: string;
  readonly receiver: Node;
  readonly nameNode: Node;
  readonly access: Node;
}

/** The module export a use ultimately enters through, plus any property path below an imported object. */
export interface ModuleMemberOrigin {
  readonly kind: "module";
  /** The import door exactly as authored by the consumer. Re-export traversal never rewrites it. */
  readonly moduleSpecifier: string;
  readonly exportedName: string;
  readonly memberPath: readonly string[];
  readonly declaration: Node;
  readonly canonical:
    | {
        readonly kind: "project";
        readonly sourceFile: SourceFile;
        readonly exportedName: string;
        readonly declaration: Node;
        /** How many declarations the resolved export symbol carries. `1` for an ordinary export; `>1` for an
         *  OVERLOAD SET (signatures plus at most one implementation, all in `sourceFile`), whose identity home
         *  is still unique — the count is carried so a consumer that must distinguish them can, without the
         *  reader having to refuse a callable whose home it can prove. */
        readonly declarationCount: number;
      }
    | {
        /** A checker-unresolved package door proves spelling, not that the package exports the member. */
        readonly kind: "external-door";
        readonly moduleSpecifier: string;
        readonly exportedName: string;
        readonly declaration: Node;
      };
}

/** A checker-proven ambient global and the property path below it. */
export interface GlobalMemberOrigin {
  readonly kind: "global";
  readonly globalName: string;
  readonly memberPath: readonly string[];
  readonly declarations: readonly Node[];
}

export type ReferenceOrigin = ModuleMemberOrigin | GlobalMemberOrigin;

/** The semantic target of a direct call/new expression after immutable binding aliases. */
export interface CallableOrigin {
  readonly invocation: "call" | "construct";
  readonly target: ReferenceOrigin;
  readonly callee: Node;
}

/** The binding primitives injected into module-origin traversal to keep one resolver implementation. */
export interface ReferenceResolutionServices {
  readonly unwrapExpression: (node: Node) => Node;
  readonly declarationOf: (identifier: Identifier) => ReferenceFact<Node>;
  readonly inspectStableBinding: (declaration: Node) => ReferenceFact<true>;
  readonly inspectReferenceWrites: (identifier: Identifier) => ReferenceFact<true>;
  readonly inspectSymbolWrites: (symbol: MorphSymbol, node: Node) => ReferenceFact<true>;
  readonly readComputedName: (node: Node) => ReferenceFact<string>;
  readonly readMemberReference: (node: Node) => ReferenceFact<MemberReference>;
}
