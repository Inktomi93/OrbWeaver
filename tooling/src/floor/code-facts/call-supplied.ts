// Supplied formals and complete callable consumers reuse the captured native call/return graph.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { resolveStableExpression } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type {
  CallReturnObservation,
  CallReturnObservations,
  CallReturnProgram,
  ReferenceFact,
  ReferenceUnresolvedReason,
  UnresolvedReferenceFact,
} from "./reference-fact-contract.ts";
import { unprovenReferenceUse } from "./reference-fact-writes.ts";
import { unresolved as referenceRefusal } from "./type-member-origin-core.ts";

function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, detail: string, declarations: readonly MorphNode[] = []): UnresolvedReferenceFact {
  return { ...referenceRefusal(reason, node, detail), trace: { declarations, origin: node } };
}

function possiblyUndefined(type: import("ts-morph").Type): boolean {
  return type.isUnion() ? type.getUnionTypes().some(possiblyUndefined) : type.isUndefined() || type.isVoid() || type.isAny() || type.isUnknown();
}

/** A runtime undefined producer is syntax or the native intrinsic symbol, never a declared return type. */
export function runtimeUndefinedValue(node: MorphNode): boolean {
  const symbol = node.getSymbol();
  return Node.isVoidExpression(node) || (symbol !== undefined && node.getProject().getTypeChecker().compilerObject.isUndefinedSymbol(symbol.compilerSymbol));
}

function suppliedArgument(parameter: import("ts-morph").ParameterDeclaration, argument: MorphNode | undefined): ReferenceFact<MorphNode | undefined> {
  const initializer = parameter.getInitializer();
  let value = argument ?? initializer;
  if (argument !== undefined && initializer !== undefined) {
    const stable = resolveStableExpression(argument);
    const terminal = unwrapTarget(stable.kind === "resolved" ? stable.value : stable.node);
    if (runtimeUndefinedValue(terminal)) {
      value = initializer;
    } else if (possiblyUndefined(argument.getType())) {
      return unresolved("unsupported", argument, "a defaulted formal has an argument whose runtime undefined alternative is not closed", [parameter]);
    }
  }
  return { kind: "resolved", value, trace: { declarations: [parameter], origin: argument ?? parameter } };
}

/** Complete observed consumers of one actual callable; sparse or escaping reference coverage refuses. */
export function readObservedCallableConsumers(owner: MorphNode, program: CallReturnProgram): ReferenceFact<readonly CallReturnObservation[]> {
  if (
    !(Node.isFunctionDeclaration(owner) || Node.isArrowFunction(owner) || Node.isFunctionExpression(owner) || Node.isMethodDeclaration(owner)) ||
    owner.getBody() === undefined
  ) {
    return unresolved("missing", owner, "the callable has no authored use body", [owner]);
  }
  if (!program.referencesObserved) {
    return unresolved("missing", owner, "callable reference coverage was not supplied", [owner]);
  }
  const escaped = program.escapingReferences.get(owner.compilerNode)?.[0];
  if (escaped !== undefined) {
    return escaped;
  }
  const callers = program.callers.get(owner.compilerNode) ?? [];
  const parent = owner.getParent();
  let name: MorphNode | undefined;
  if (Node.isFunctionDeclaration(owner)) {
    name = owner.getNameNode();
  } else if (Node.isVariableDeclaration(parent)) {
    name = parent.getNameNode();
  }
  if (Node.isIdentifier(name)) {
    const accepted = new Set([name, ...callers.flatMap((caller) => [caller.call.getExpression(), ...caller.call.getExpression().getDescendants()])]);
    const missing = unprovenReferenceUse(name, accepted);
    if (missing !== undefined) {
      return unresolved("unsupported", missing, "an actual callable reference has no admitted supplied consumer", [owner]);
    }
  }
  return callers.length === 0
    ? unresolved("missing", owner, "the callable has no observed supplied consumers", [owner])
    : { kind: "resolved", value: callers, trace: { declarations: [owner], origin: owner } };
}

/** Actual supplied alternatives of a formal, including omitted optional values; annotation supplies no origin. */
export function readSuppliedParameter(
  node: MorphNode,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  program: CallReturnProgram | undefined,
): ReferenceFact<readonly import("./reference-fact-contract.ts").ReturnedValueSource[]> {
  const parameter = node.getSymbol()?.getValueDeclaration();
  if (!Node.isParameterDeclaration(parameter)) {
    return unresolved("unsupported", node, "the value is not a formal parameter", []);
  }
  const supplied = bindings.get(parameter);
  if (supplied !== undefined) {
    const argument = suppliedArgument(parameter, supplied);
    return argument.kind === "unresolved"
      ? argument
      : { kind: "resolved", value: [{ value: argument.value ?? node, path: [], present: argument.value !== undefined, bindings }], trace: argument.trace };
  }
  const owner = parameter.getParent();
  if (
    program === undefined ||
    !(Node.isFunctionDeclaration(owner) || Node.isArrowFunction(owner) || Node.isFunctionExpression(owner) || Node.isMethodDeclaration(owner)) ||
    parameter.isRestParameter()
  ) {
    return unresolved("missing", node, "the formal has no complete supplied native caller context", [parameter]);
  }
  const callers = readObservedCallableConsumers(owner, program);
  if (callers.kind === "unresolved") {
    return callers;
  }
  const index = owner.getParameters().indexOf(parameter);
  const alternatives = callers.value.map((caller) => ({ caller, argument: suppliedArgument(parameter, caller.call.getArguments()[index]) }));
  const failed = alternatives.find(({ argument }) => argument.kind === "unresolved")?.argument;
  if (failed?.kind === "unresolved") {
    return failed;
  }
  return {
    kind: "resolved",
    value: alternatives.flatMap(({ caller, argument }) =>
      argument.kind === "resolved"
        ? [{ value: argument.value ?? node, path: [], present: argument.value !== undefined, bindings: readCallBindings(caller.call, owner, bindings) }]
        : [],
    ),
    trace: { declarations: [parameter, owner], origin: node },
  };
}

/** Definite actual/default bindings; an unresolved default alternative remains unavailable, not an argument grant. */
export function readCallBindings(call: CallExpression, owner: MorphNode, previous: ReadonlyMap<MorphNode, MorphNode>): ReadonlyMap<MorphNode, MorphNode> {
  const bindings = new Map(previous);
  if (Node.isFunctionDeclaration(owner) || Node.isArrowFunction(owner) || Node.isFunctionExpression(owner) || Node.isMethodDeclaration(owner)) {
    for (const [index, parameter] of owner.getParameters().entries()) {
      const argument = suppliedArgument(parameter, call.getArguments()[index]);
      bindings.delete(parameter);
      if (argument.kind === "resolved" && argument.value !== undefined) {
        bindings.set(parameter, argument.value);
      }
    }
  }
  return bindings;
}

/** Exact native world/epoch admission precedes every use of captured callable/return nodes. */
export function readCallReturnProgram(node: MorphNode, observations: CallReturnObservations): ReferenceFact<CallReturnProgram> {
  if (node.wasForgotten()) {
    return unresolved("unsupported", node, "the captured value node was forgotten");
  }
  const source = node.getSourceFile();
  const program = observations.programs.find((candidate) => candidate.sources.has(source));
  if (
    program === undefined ||
    [...program.sources].some(([file, snapshot]) => file.wasForgotten() || file.compilerNode !== snapshot) ||
    node.getProject().getProgram().compilerObject !== program.program
  ) {
    return unresolved("unsupported", node, "call/return observations belong to another compiler world or a stale source/program epoch");
  }
  return { kind: "resolved", value: program, trace: { declarations: [], origin: node } };
}
