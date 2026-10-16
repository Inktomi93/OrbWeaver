// The closed vocabulary returned by the final spelling-independent binding/reference reader.
import type { CallExpression, Identifier, Symbol as MorphSymbol, Node, SourceFile, ts } from "ts-morph";
import { SyntaxKind } from "ts-morph";

/** Every syntax kind carrying a member reference, including optional and literal-bracket spellings. */
export const MEMBER_ACCESS_KINDS = [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression] as const;

export const REFERENCE_UNRESOLVED_REASONS = ["unsupported", "dynamic", "write", "cycle", "ambiguous", "missing"] as const;

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

/** Source-local effects share the reference pass lifetime; prototype exposure is not an own-field write. */
export interface SourceWriteFacts {
  readonly written: ReadonlySet<object>;
  readonly reassigned: ReadonlySet<object>;
  readonly inheritedReads: readonly Node[];
}

/** Effect projection consumes actual captured alternatives, including their paired argument bindings. */
export interface InheritedReadEffectContext {
  readonly program: CallReturnProgram;
  readonly values: (node: Node, path: readonly string[], bindings: ReadonlyMap<Node, Node>) => ReferenceFact<readonly ReturnedValueSource[]>;
}

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

/** A native target and arguments captured by immutable bind construction, without claiming execution. */
export interface CallableBinding {
  readonly target: ReferenceOrigin;
  readonly callee: Node;
  readonly arguments: ReferenceFact<readonly Node[]>;
}

/** Native Function wrappers retain their target and ordered actual arguments; binding is not execution. */
export interface CallableInvocation extends CallableBinding {
  readonly invocation: "call" | "construct" | "bind";
}

/** A native bind construction was observed, but its captured identity could not close. This is no target grant. */
export interface CallableCaptureRefusal extends UnresolvedReferenceFact {
  readonly capture: "native-bind";
}

export type CallableInvocationFact = ReferenceFact<CallableInvocation> | CallableCaptureRefusal;

/** Original member declarations and native call signatures, without a runtime instance-origin grant. */
export interface InstanceMethodTarget {
  readonly member: import("./type-member-origin-contract.ts").TypeMemberOrigin;
  /** Overloaded originals retain ambiguity; a wrapper's selected return signature cannot select their identity. */
  readonly signature: ReferenceFact<import("ts-morph").Signature>;
}

/** Native wrapper mechanics and declared instance evidence remain separate from actual receiver provenance. */
export interface InstanceMethodInvocation {
  readonly invocation: CallableInvocation["invocation"];
  readonly target: InstanceMethodTarget;
  readonly callee: Node;
  readonly captureDeclarations: readonly Node[];
  readonly arguments: ReferenceFact<readonly Node[]>;
  readonly thisArgument: ReferenceFact<Node | undefined>;
  readonly receiverSource: ReferenceFact<Node | undefined>;
  readonly executedSignature: ReferenceFact<import("ts-morph").Signature>;
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

/** Supplied native calls and their authored return paths, scoped to one policy invocation and compiler epoch. */
export interface CallReturnObservation {
  readonly call: CallExpression;
  readonly target: ReferenceFact<Node>;
  readonly targets: ReferenceFact<readonly Node[]>;
  /** Possible bodies of a native optional invocation; never a returned-data or mandatory-execution fact. */
  readonly invocationTargets?: ReferenceFact<readonly Node[]>;
  readonly alternatives: ReferenceFact<readonly CallReturnAlternative[]>;
  readonly returns: ReferenceFact<readonly Node[]>;
}

export interface CallReturnAlternative {
  readonly nativeReturns?: ReferenceFact<readonly Node[]>;
  readonly target: Node;
  readonly returns: ReferenceFact<readonly Node[]>;
  /** Captured only when authored bare-return absence was explicitly requested. */
  readonly explicitReturns?: ReferenceFact<readonly Node[]>;
}

/** Mutable capture owners expose their read-only proof inputs without hiding admission in a predicate. */
export interface CallReturnProofContext {
  /** Opaque admission effects cannot grant dependency-directed refinement reuse. */
  readonly untrackedRead?: () => void;
  readonly admitted: ReadonlySet<ts.CallExpression>;
  readonly activeOwners: ReadonlySet<ts.Node>;
  readonly referenceRevision: number;
  readonly demandRevision: number;
  readonly directRevision: number;
  readonly settledDemandRevision: number;
  readonly refining: boolean;
}

/** Opaque predicates retain ordinary invocation semantics; structured memberships are owned native inputs. */
export type CallableAdmission = ((call: CallExpression) => boolean) | { readonly captured: CallReturnProgram } | { readonly admitted: CallReturnProofContext };

export interface CallReturnProgram {
  /** Reached value calls extend this capture's neutral facts; a queued round is not an admitted result. */
  readonly demandValueCall?: (call: CallExpression) => ReferenceFact<true>;
  readonly nativeParsedValue?: (
    call: CallExpression,
    path: readonly string[],
    context: ReturnedValueContext,
    services: NativeValueTransferServices,
  ) => ReferenceFact<readonly ReturnedValueSource[]> | undefined;
  readonly callableContext?: CallReturnProofContext;
  readonly nativeStatementReachable?: (node: Node) => ReferenceFact<true>;
  readonly nativeSymbolServices?: {
    readonly callableOrigin: typeof import("./reference-fact-call.ts").resolveCallableValueOrigin;
    readonly memberOrigin: typeof import("./type-member-origin.ts").resolveTypeMemberOrigin;
    readonly declaredByPackage: typeof import("./type-member-origin.ts").declaredByPackage;
  };
  readonly nativeReturnPaths?: (node: Node, explicitAbsentReturns: boolean) => ReferenceFact<readonly Node[]>;
  readonly nativeValueTransfers?: true;
  readonly suppliedCallableTargets?: true;
  readonly suppliedCallableUses?: (owner: Node) => ReferenceFact<true>;
  readonly suppliedCallableValue?: (node: Node) => ReferenceFact<CallableDeclaration>;
  readonly program: ts.Program;
  readonly sources: ReadonlyMap<SourceFile, ts.SourceFile>;
  readonly calls: readonly CallReturnObservation[];
  readonly byCall: ReadonlyMap<ts.CallExpression, CallReturnObservation>;
  readonly callers: ReadonlyMap<ts.Node, readonly CallReturnObservation[]>;
  readonly referencesObserved: boolean;
  readonly escapingReferences: ReadonlyMap<ts.Node, readonly UnresolvedReferenceFact[]>;
}

export interface CallReturnObservations {
  readonly programs: readonly CallReturnProgram[];
}

/** Actual callback element provenance, without inventing a runtime array index or trusting its fields. */
export interface NativeValueIteration {
  readonly call: CallExpression;
  readonly collection: Node;
  readonly parameter: Node;
}

/** Native resource registration retains disposal consumers as well as the returned argument identity. */
export interface NativeResourceRegistration {
  readonly argument: Node;
  readonly disposers: readonly ReturnedValueSource[];
}

/** One authored returned-value leaf, with the exact supplied arguments that bind its parameters. */
export interface ReturnedValueSource {
  /** Winning own-data value hops retain the bindings at selection, before formal refinement. */
  readonly selectedDescriptors?: readonly { readonly value: Node; readonly bindings: ReadonlyMap<Node, Node> }[];
  readonly nativeIteration?: NativeValueIteration;
  readonly nativeLookup?: { readonly call: CallExpression; readonly key: Node };
  /** Absence is local to this alternative; only an absent spread member falls back. */
  readonly present: boolean;
  readonly value: Node;
  readonly path: readonly string[];
  readonly bindings: ReadonlyMap<Node, Node>;
}

/** Shared traversal state; the native concern receives the same captured world, bindings and cycle set. */
export interface ReturnedValueContext {
  readonly callableValues?: true;
  readonly nativeValueTransfers: boolean;
  readonly nativeIterations: ReadonlyMap<Node, NativeValueIteration>;
  readonly explicitAbsentReturns: boolean;
  readonly program: CallReturnProgram | undefined;
  readonly terminals: ReturnedValueTerminals;
  readonly bindings: ReadonlyMap<Node, Node>;
  readonly active: ReadonlySet<ts.Node>;
}

/** Native carriers reuse the sole value traversal and its alternative/refusal operations. */
export interface NativeValueTransferServices {
  readonly outputUse: (node: Node, path: readonly string[], context: ReturnedValueContext, values: readonly ReturnedValueSource[]) => ReferenceFact<true>;
  readonly inheritedEffects: (node: Node, context: ReturnedValueContext) => ReferenceFact<true>;
  readonly readValue: (node: Node, path: readonly string[], context: ReturnedValueContext) => ReferenceFact<readonly ReturnedValueSource[]>;
  readonly leaf: (node: Node, path: readonly string[], context: ReturnedValueContext, present?: boolean) => ReferenceFact<readonly ReturnedValueSource[]>;
  readonly alternatives: (node: Node, facts: readonly ReferenceFact<readonly ReturnedValueSource[]>[]) => ReferenceFact<readonly ReturnedValueSource[]>;
  readonly refusal: (node: Node, reason: ReferenceUnresolvedReason, detail: string) => UnresolvedReferenceFact;
}

/** Returned-value consumers retain bindings already admitted by the same native invocation. */
export interface ReturnedValueInputs {
  /** Interpret supported native callback/cache carriers only in an explicitly captured native invocation. */
  readonly nativeValueTransfers?: true;
  /** Preserve explicitly authored bare returns as absent alternatives; strict projection is the default. */
  readonly explicitAbsentReturns?: true;
  readonly terminals: ReturnedValueTerminals;
  readonly bindings: ReadonlyMap<Node, Node>;
}

/** Target refinement is independent of returned-data projection and remains explicitly requested. */
export interface CallReturnCaptureOptions extends Pick<ReturnedValueInputs, "explicitAbsentReturns" | "nativeValueTransfers"> {
  readonly suppliedCallableTargets?: true;
}

/** Consumers identify actual native terminal calls on demand, without an additional call inventory. */
export type ReturnedValueTerminals = ReadonlySet<ts.CallExpression> | ((call: CallExpression) => boolean);

/** Canonical scope/value admission operations supplied to the ambient native classifier. */
export interface NativeAmbientCallServices extends ReferenceResolutionServices {
  readonly readCallReturnProgram: (node: Node, observations: CallReturnObservations) => ReferenceFact<CallReturnProgram>;
  readonly resolveStableExpression: (node: Node) => ReferenceFact<Node>;
}

/** Selected installed String operation evidence; it establishes no input-data trust or execution theorem. */
export interface NativeStringCall {
  readonly call: CallExpression;
  readonly origin: GlobalMemberOrigin;
  readonly valueDeclaration: Node;
  readonly signature: import("ts-morph").Signature;
  readonly argument: Node;
  readonly argumentType: import("ts-morph").Type;
  readonly program: CallReturnProgram;
}
