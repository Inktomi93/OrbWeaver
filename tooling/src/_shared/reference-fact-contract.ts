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

/** One property or qualified type read, normalized across dotted, optional, computed-literal, and
 *  namespace-qualified type spellings. */
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
        /** The ONE home. An OVERLOAD SET (signatures plus at most one implementation, all in `sourceFile`)
         *  lands its implementation here; the set's SIZE is deliberately not a field — no reader consumes it,
         *  and `declaration.getSymbol()?.getDeclarations()` still has it for one that ever does. */
        readonly declaration: Node;
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

/** WHICH callable declaration a call denotes, and the body that implements it.
 *
 *  The question three policies each finished with their own `getSymbol().getDeclarations()` chain (#2097):
 *  the audit of a test's assertion helper, the returns of a class-string factory, and the identity of the
 *  membrane's canonical dump guard. It is deliberately NOT a declaration LIST — a caller receives ONE
 *  proven declaration or one precise refusal, so multiplicity, reassignment and cycles cannot be answered
 *  differently by each consumer.
 *
 *  `body` ABSENT IS A FACT, NOT A REFUSAL: `declare function`, an overload signature and an ambient global
 *  are real callable declarations with no authored body, and a caller asking about IDENTITY (is this the
 *  membrane's own guard?) must still get its answer. A caller asking about the body reads `body`. */
export interface CallableDeclaration {
  /** The authored function-like node: a `FunctionDeclaration`, or the arrow/function expression an
   *  immutable binding holds. Never the binding itself, so two spellings of one callable compare equal. */
  readonly declaration: Node;
  readonly body: Node | undefined;
  /** The declaration's own file — the house idiom for a home question about a RESOLVED declaration, which
   *  `ctx.relativePath` throws on when the resolution escapes the policy's population (guide §12.3). */
  readonly sourceFile: SourceFile;
}

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
