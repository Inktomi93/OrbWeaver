// Native Function invocation wrappers compose the existing origin, immutable binding and argument facts.
// Bound construction is not execution; unknown or escaping argument tuples never supply a complete invocation.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readCallReturnProgram, runtimeUndefinedValue } from "./call-supplied.ts";
import { readMemberReference, referenceResolutionServices, resolveStableExpression } from "./reference-fact.ts";
import { resolveCallableTargetOrigin } from "./reference-fact-call.ts";
import type {
  CallableBinding,
  CallableInvocation,
  CallableInvocationFact,
  CallReturnObservations,
  InstanceMethodInvocation,
  InstanceMethodTarget,
  ReferenceFact,
  ReferenceOrigin,
  ReferenceUnresolvedReason,
} from "./reference-fact-contract.ts";
import { unprovenReferenceUse } from "./reference-fact-writes.ts";
import { resolveTypeMemberOrigin } from "./type-member-origin.ts";

const WRAPPERS = ["call", "apply", "bind"] as const;
type Wrapper = (typeof WRAPPERS)[number];

interface InvocationBinding<T> {
  readonly target: T;
  readonly callee: MorphNode;
  readonly captureDeclarations: readonly MorphNode[];
  readonly arguments: ReferenceFact<readonly MorphNode[]>;
  readonly thisArgument: ReferenceFact<MorphNode | undefined>;
  readonly bound: boolean;
}
interface InvocationMechanics<T> extends InvocationBinding<T> {
  readonly invocation: CallableInvocation["invocation"];
}
type TargetReader<T> = (node: MorphNode) => ReferenceFact<T>;

function refusal(node: MorphNode, reason: ReferenceUnresolvedReason, detail: string): ReferenceFact<never> {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [], origin: node } };
}
function resolved<T>(node: MorphNode, value: T): ReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations: [], origin: node } };
}

function nativeWrapper(node: MorphNode): ReferenceFact<Wrapper> | undefined {
  const member = readMemberReference(node);
  const name = member.kind === "resolved" ? WRAPPERS.find((wrapper) => wrapper === member.value.name) : undefined;
  if (member.kind !== "resolved" || name === undefined) {
    return;
  }
  const symbol = node.getSymbol() ?? member.value.receiver.getType().getProperty(member.value.name);
  const declarations = symbol?.getDeclarations() ?? [];
  const program = node.getProject().getProgram().compilerObject;
  const native =
    declarations.length > 0 &&
    declarations.every((declaration) => {
      const owner = declaration.getFirstAncestorByKind(SyntaxKind.InterfaceDeclaration);
      return (
        Node.isMethodSignature(declaration) &&
        ["Function", "CallableFunction", "NewableFunction"].includes(owner?.getName() ?? "") &&
        program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode)
      );
    });
  if (!native || symbol === undefined) {
    return refusal(node, "unsupported", "the invocation wrapper is not the native Function declaration");
  }
  const stable = referenceResolutionServices.inspectSymbolWrites(symbol, node);
  return stable.kind === "unresolved" ? stable : resolved(node, name);
}

function tupleArguments(node: MorphNode, active: ReadonlySet<object>): ReferenceFact<readonly MorphNode[]> {
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved") {
    return stable;
  }
  if (!Node.isArrayLiteralExpression(stable.value)) {
    return refusal(node, "unsupported", "apply/spread arguments have no closed authored tuple");
  }
  for (const declaration of stable.trace.declarations) {
    if (!Node.isVariableDeclaration(declaration)) {
      continue;
    }
    const name = declaration.getNameNode();
    if (!Node.isIdentifier(name) || unprovenReferenceUse(name, (use) => use.compilerNode === node.compilerNode) !== undefined) {
      return refusal(node, "write", "the invocation argument tuple has a mutating or escaping consumer");
    }
  }
  return orderedArguments(stable.value.getElements(), active, node);
}

function orderedArguments(nodes: readonly MorphNode[], active: ReadonlySet<object>, anchor: MorphNode): ReferenceFact<readonly MorphNode[]> {
  const values: MorphNode[] = [];
  for (const node of nodes) {
    if (active.has(node.compilerNode) || Node.isOmittedExpression(node)) {
      return refusal(node, "unsupported", "invocation arguments contain a cycle or an unmodelled tuple hole");
    }
    if (Node.isSpreadElement(node)) {
      const tuple = tupleArguments(node.getExpression(), new Set(active).add(node.compilerNode));
      if (tuple.kind === "unresolved") {
        return tuple;
      }
      values.push(...tuple.value);
    } else {
      values.push(node);
    }
  }
  return resolved(anchor, values);
}

function callArguments(
  call: CallExpression,
  arguments_: ReferenceFact<readonly MorphNode[]>,
  wrapper: Wrapper | undefined,
  active: ReadonlySet<object>,
): ReferenceFact<readonly MorphNode[]> {
  if (arguments_.kind === "unresolved" || wrapper === undefined) {
    return arguments_;
  }
  if (wrapper !== "apply") {
    return resolved(call, arguments_.value.slice(1));
  }
  const tuple = arguments_.value[1];
  return tuple === undefined || runtimeUndefinedValue(tuple) || Node.isNullLiteral(tuple) ? resolved(call, []) : tupleArguments(tuple, active);
}

function boundSource(node: MorphNode): ReferenceFact<MorphNode> {
  const stable = resolveStableExpression(node);
  const value = stable.kind === "resolved" ? stable.value : stable.node;
  if (stable.kind === "unresolved" && stable.reason !== "dynamic") {
    return stable;
  }
  for (const declaration of stable.trace.declarations) {
    if (Node.isVariableDeclaration(declaration)) {
      const safety = referenceResolutionServices.inspectStableBinding(declaration);
      if (safety.kind === "unresolved") {
        return safety;
      }
    }
  }
  return { ...stable, kind: "resolved", value };
}

function targetOf<T>(node: MorphNode, active: ReadonlySet<object>, readTarget: TargetReader<T>): ReferenceFact<InvocationBinding<T>> {
  if (active.has(node.compilerNode)) {
    return refusal(node, "cycle", "a bound callable revisits its source expression");
  }
  const direct = readTarget(node);
  const stable = boundSource(node);
  if (stable.kind === "resolved" && Node.isCallExpression(stable.value)) {
    const wrapper = nativeWrapper(stable.value.getExpression());
    if (wrapper?.kind === "resolved" && wrapper.value === "bind") {
      const captured = invocation(stable.value, new Set(active).add(node.compilerNode), readTarget);
      return captured.kind === "unresolved"
        ? captured
        : { ...captured, value: { ...captured.value, captureDeclarations: [...stable.trace.declarations, ...captured.value.captureDeclarations] } };
    }
    if (wrapper?.kind === "unresolved") {
      return wrapper;
    }
  }
  if (direct.kind === "resolved") {
    const member = readMemberReference(node);
    const thisArgument = member.kind === "resolved" ? member.value.receiver : undefined;
    return {
      ...direct,
      value: {
        target: direct.value,
        callee: node,
        captureDeclarations: direct.trace.declarations,
        arguments: resolved(node, []),
        thisArgument: resolved(node, thisArgument),
        bound: false,
      },
    };
  }
  return stable.kind === "unresolved" ? stable : direct;
}

function invocation<T>(call: CallExpression, active: ReadonlySet<object>, readTarget: TargetReader<T>): ReferenceFact<InvocationMechanics<T>> {
  const callee = referenceResolutionServices.unwrapExpression(call.getExpression());
  const wrapper = nativeWrapper(callee);
  if (wrapper?.kind === "unresolved") {
    return wrapper;
  }
  const member = wrapper === undefined ? undefined : readMemberReference(callee);
  const receiver = member?.kind === "resolved" ? member.value.receiver : callee;
  const target = targetOf(receiver, active, readTarget);
  if (target.kind === "unresolved") {
    return target;
  }
  const supplied = orderedArguments(call.getArguments(), active, call);
  const arguments_ = callArguments(call, supplied, wrapper?.value, active);
  const inherited = target.value.arguments;
  let all = inherited;
  if (inherited.kind === "resolved") {
    all = arguments_.kind === "unresolved" ? arguments_ : resolved(call, [...inherited.value, ...arguments_.value]);
  }
  let thisArgument = target.value.thisArgument;
  if (!target.value.bound && wrapper !== undefined) {
    thisArgument = supplied.kind === "unresolved" ? supplied : resolved(call, supplied.value[0]);
  }
  return {
    ...target,
    value: {
      invocation: wrapper?.value === "bind" ? "bind" : "call",
      target: target.value.target,
      callee: target.value.callee,
      captureDeclarations: target.value.captureDeclarations,
      arguments: all,
      thisArgument,
      bound: target.value.bound || wrapper?.value === "bind",
    },
  };
}

/** Actual native invocation identity and effective argument order, optionally admitted by an existing captured world. */
export function readCallableInvocation(node: MorphNode, observations?: CallReturnObservations): CallableInvocationFact {
  if (node.wasForgotten()) {
    return refusal(node, "unsupported", "the invocation source was forgotten");
  }
  const captured = observations === undefined ? undefined : readCallReturnProgram(node, observations);
  if (captured?.kind === "unresolved") {
    return captured;
  }
  if (Node.isCallExpression(node)) {
    const fact = invocation(node, new Set(), resolveCallableTargetOrigin);
    return capturedRefusal(fact.kind === "unresolved" ? fact : { ...fact, value: strictInvocation(fact.value) });
  }
  return Node.isNewExpression(node) ? capturedRefusal(constructInvocation(node)) : refusal(node, "unsupported", "the supplied node is not an invocation");
}

function strictInvocation(value: InvocationMechanics<ReferenceOrigin>): CallableInvocation {
  return { invocation: value.invocation, target: value.target, callee: value.callee, arguments: value.arguments };
}

function capturedRefusal(fact: ReferenceFact<CallableInvocation>): CallableInvocationFact {
  if (fact.kind !== "unresolved" || !["write", "cycle", "ambiguous"].includes(fact.reason)) {
    return fact;
  }
  const nativeBind = [...fact.trace.declarations, fact.node].some((declaration) => {
    const raw = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
    const initializer = raw === undefined ? undefined : referenceResolutionServices.unwrapExpression(raw);
    const wrapper = Node.isCallExpression(initializer) ? nativeWrapper(initializer.getExpression()) : undefined;
    return wrapper?.kind === "resolved" && wrapper.value === "bind";
  });
  return nativeBind ? { ...fact, capture: "native-bind" } : fact;
}

function constructInvocation(node: import("ts-morph").NewExpression): ReferenceFact<CallableInvocation> {
  const target = targetOf(node.getExpression(), new Set(), resolveCallableTargetOrigin);
  if (target.kind === "unresolved") {
    return target;
  }
  const arguments_ = orderedArguments(node.getArguments(), new Set(), node);
  const inherited = target.value.arguments;
  let all = inherited;
  if (inherited.kind === "resolved") {
    all = arguments_.kind === "unresolved" ? arguments_ : resolved(node, [...inherited.value, ...arguments_.value]);
  }
  return { ...target, value: { invocation: "construct", target: target.value.target, callee: target.value.callee, arguments: all } };
}

/** An immutable callable value retains its bound target without an invented invocation or compiler program. */
export function readCallableBinding(node: MorphNode, observations?: CallReturnObservations): ReferenceFact<CallableBinding> {
  if (node.wasForgotten()) {
    return refusal(node, "unsupported", "the binding source was forgotten");
  }
  const captured = observations === undefined ? undefined : readCallReturnProgram(node, observations);
  if (captured?.kind === "unresolved") {
    return captured;
  }
  const fact = targetOf(node, new Set(), resolveCallableTargetOrigin);
  if (fact.kind === "unresolved") {
    return fact;
  }
  const binding = { target: fact.value.target, callee: fact.value.callee, arguments: fact.value.arguments };
  const value = fact.value.bound ? { invocation: "bind", ...binding } : binding;
  return { ...fact, value };
}

function instanceTarget(node: MorphNode): ReferenceFact<InstanceMethodTarget> {
  const stable = boundSource(node);
  if (stable.kind === "unresolved") {
    return stable;
  }
  const member = resolveTypeMemberOrigin(stable.value);
  if (member.kind === "unresolved") {
    return member;
  }
  const writes = referenceResolutionServices.inspectSymbolWrites(member.value.symbol, member.value.access);
  if (writes.kind === "unresolved") {
    return writes;
  }
  const signatures = member.value.access.getType().getCallSignatures();
  const single = signatures.length === 1 ? signatures[0] : undefined;
  const signature =
    single === undefined
      ? refusal(node, signatures.length === 0 ? "missing" : "ambiguous", "the original member has no single native callable signature")
      : resolved(node, single);
  return {
    ...member,
    value: { member: member.value, signature },
    trace: { ...member.trace, declarations: [...stable.trace.declarations, ...member.trace.declarations] },
  };
}

function receiverSource(value: ReferenceFact<MorphNode | undefined>): ReferenceFact<MorphNode | undefined> {
  if (value.kind === "unresolved" || value.value === undefined) {
    return value;
  }
  const symbol = value.value.getSymbol();
  const writes = symbol === undefined ? undefined : referenceResolutionServices.inspectSymbolWrites(symbol, value.value);
  return writes?.kind === "unresolved" ? writes : resolveStableExpression(value.value);
}

/** Declared instance-method evidence and native wrapper mechanics; unresolved receiver sources grant no runtime origin. */
export function readInstanceMethodInvocation(node: MorphNode, observations?: CallReturnObservations): ReferenceFact<InstanceMethodInvocation> {
  if (node.wasForgotten()) {
    return refusal(node, "unsupported", "the instance invocation source was forgotten");
  }
  const captured = observations === undefined ? undefined : readCallReturnProgram(node, observations);
  if (captured?.kind === "unresolved") {
    return captured;
  }
  if (!Node.isCallExpression(node)) {
    return refusal(node, "unsupported", "the supplied instance node is not a call expression");
  }
  const fact = invocation(node, new Set(), instanceTarget);
  if (fact.kind === "unresolved") {
    return fact;
  }
  const selected = node.getProject().getTypeChecker().getResolvedSignature(node);
  return {
    ...fact,
    value: {
      invocation: fact.value.invocation,
      target: fact.value.target,
      callee: fact.value.callee,
      captureDeclarations: fact.value.captureDeclarations,
      arguments: fact.value.arguments,
      thisArgument: fact.value.thisArgument,
      receiverSource: receiverSource(fact.value.thisArgument),
      executedSignature:
        selected === undefined ? refusal(node, "missing", "the instance invocation has no native selected signature") : resolved(node, selected),
    },
  };
}
