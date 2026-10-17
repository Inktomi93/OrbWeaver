// Supplied formals and complete callable consumers reuse the captured native call/return graph.
import type { CallExpression, Identifier, Node as MorphNode, ts } from "ts-morph";
import { Node } from "ts-morph";
import {
  privateSuppliedCall,
  privateSuppliedConsumers,
  privateSuppliedEscape,
  privateValueSupply,
  suppliedValueContextRefusal,
} from "./call-supplied-private.ts";
import { capturedSourcesCurrent, RefinementMap } from "./capture-map.ts";
import { isDocumentationLinkReference, readModuleAliasBinding, resolveStableExpression } from "./reference-fact.ts";
import { lexicalReferenceSymbol, unwrapTarget } from "./reference-fact-alias.ts";
import type {
  CallReturnObservation,
  CallReturnObservations,
  CallReturnProgram,
  NativeNamespaceAliasInputs,
  ReferenceFact,
  ReferenceUnresolvedReason,
  ReferenceUseAdmission,
  ReturnedValueContext,
  SuppliedValueSource,
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

function suppliedEpochRefusal(node: MorphNode, program: CallReturnProgram | undefined): UnresolvedReferenceFact | undefined {
  const admitted = program?.suppliedCallableTargets === true ? readCallReturnProgram(node, { programs: [program] }) : undefined;
  return admitted?.kind === "unresolved" ? admitted : undefined;
}

function callableName(owner: MorphNode): MorphNode | undefined {
  if (Node.isFunctionDeclaration(owner)) {
    return owner.getNameNode();
  }
  const parent = owner.getParent();
  return Node.isVariableDeclaration(parent) ? parent.getNameNode() : undefined;
}

function demandNamespaceConsumer(use: MorphNode, binding: Identifier, owner: MorphNode, program: CallReturnProgram): ReferenceFact<true> | undefined {
  const call = use.getParent();
  if (!Node.isCallExpression(call) || call.getExpression() !== use) {
    return;
  }
  const published = (): boolean => {
    const observation = program.byCall.get(call.compilerNode);
    const targets = observation?.invocationTargets ?? observation?.targets;
    return (
      targets?.kind === "resolved" &&
      targets.value.some((target) => target.compilerNode === owner.compilerNode) &&
      program.callers.get(owner.compilerNode)?.some((caller) => caller.call.compilerNode === call.compilerNode) === true
    );
  };
  const admitted = readCallReturnReference(use, binding, program);
  if (admitted.kind === "resolved" && published()) {
    return { ...admitted, value: true };
  }
  const captured = admitted.kind === "unresolved" ? admitted : program.demandValueCall?.(call);
  if (captured?.kind !== "resolved") {
    return captured;
  }
  const settled = program.suppliedCallableUses?.(call);
  if (settled?.kind !== "resolved") {
    return settled;
  }
  const current = readCallReturnProgram(owner, { programs: [program] });
  if (current.kind === "unresolved") {
    return current;
  }
  return published() ? { ...current, value: true } : unresolved("missing", call, "the namespace consumer has no published actual callable target", [owner]);
}

function captureNamespaceConsumers(name: Identifier, owner: MorphNode, program: CallReturnProgram): UnresolvedReferenceFact | undefined {
  const ownName = callableName(owner);
  let refusal: UnresolvedReferenceFact | undefined;
  const missing = unprovenReferenceUse(name, (use, binding) => {
    if (use === name || use === ownName || isDocumentationLinkReference(use)) {
      return true;
    }
    const captured = demandNamespaceConsumer(use, binding, owner, program);
    if (captured?.kind === "unresolved") {
      refusal = captured;
    }
    return captured?.kind === "resolved";
  });
  return refusal ?? (missing === undefined ? undefined : unresolved("unsupported", missing, "the namespace alias has an unproven actual consumer", [owner]));
}

function capturedModuleAlias(
  use: MorphNode,
  binding: Identifier,
  owner: MorphNode,
  inputs: NativeNamespaceAliasInputs & { readonly privateCalls?: Map<ts.CallExpression, CallReturnObservation> | undefined },
): Identifier | UnresolvedReferenceFact | undefined {
  const { program, privateCalls } = inputs;
  const admitted = readCallReturnReference(use, binding, program);
  if (admitted.kind === "unresolved") {
    return admitted;
  }
  const direct = readModuleAliasBinding(use, owner);
  if (direct?.kind === "resolved") {
    return direct.value;
  }
  const captured = program.nativeNamespaceAlias?.(use, binding, owner, inputs);
  if (captured === undefined || "kind" in captured) {
    return captured ?? direct;
  }
  // Acquisition belongs to the proven captured namespace, not ordinary closed caller coverage.
  const consumers = privateCalls === undefined ? captureNamespaceConsumers(captured, owner, program) : undefined;
  const current = readCallReturnProgram(use, { programs: [program] });
  const premise = inputs.context?.inheritedReadPremise?.require(use, program);
  return (
    consumers ??
    (current.kind === "unresolved" ? current : undefined) ??
    (premise?.kind === "unresolved" ? premise : undefined) ??
    program.escapingReferences.get(owner.compilerNode)?.[0] ??
    captured
  );
}

function callableReferenceAdmission(
  use: MorphNode,
  binding: Identifier,
  owner: MorphNode,
  inputs: NativeNamespaceAliasInputs & { readonly privateCalls?: Map<ts.CallExpression, CallReturnObservation> | undefined },
): Exclude<ReferenceUseAdmission, false> | UnresolvedReferenceFact | undefined {
  const alias = capturedModuleAlias(use, binding, owner, inputs);
  if (alias !== undefined) {
    return alias;
  }
  if (inputs.privateCalls === undefined) {
    return;
  }
  const call = privateSuppliedCall(use, binding, { owner, program: inputs.program, admit: readCallReturnReference });
  if (call === undefined || call.kind === "unresolved") {
    return call;
  }
  inputs.privateCalls.set(call.value.call.compilerNode, call.value);
  return true;
}

function observedCallableUse(use: MorphNode, owner: MorphNode, program: CallReturnProgram): MorphNode | undefined {
  for (let ancestor: MorphNode | undefined = use; ancestor !== undefined; ancestor = ancestor.getParent()) {
    const expression = ancestor.compilerNode;
    if (program.callers.get(owner.compilerNode)?.some((caller) => caller.call.getExpression().compilerNode === expression) === true) {
      return ancestor;
    }
  }
  return undefined;
}

function callableReferenceRefusal(
  name: Identifier,
  owner: MorphNode,
  inputs: NativeNamespaceAliasInputs,
  privateCalls?: Map<ts.CallExpression, CallReturnObservation>,
): UnresolvedReferenceFact | undefined {
  const { program } = inputs;
  const admittedUses: MorphNode[] = [];
  let refusal: UnresolvedReferenceFact | undefined;
  const missing = unprovenReferenceUse(name, (use, binding) => {
    if (use === name || isDocumentationLinkReference(use)) {
      return true;
    }
    const admitted = callableReferenceAdmission(use, binding, owner, { ...inputs, privateCalls });
    if (admitted !== undefined) {
      if (admitted !== true && "kind" in admitted) {
        refusal = admitted;
        return false;
      }
      return admitted;
    }
    const observed = observedCallableUse(use, owner, program);
    if (observed !== undefined) {
      admittedUses.push(observed);
      return true;
    }
    // Container aliases in the shared walk are not evidence of this exact callable identity.
    if (privateCalls !== undefined && privateSuppliedEscape(use)) {
      refusal = unresolved("unsupported", use, "a private callable consumer has an unproved container or member projection");
    }
    return false;
  });
  const expressions = new Set<import("ts-morph").ts.Node>(program.callers.get(owner.compilerNode)?.map((caller) => caller.call.getExpression().compilerNode));
  const unpublished = admittedUses.find((use) => !expressions.has(use.compilerNode));
  return (
    refusal ??
    (missing === undefined && unpublished === undefined
      ? undefined
      : unresolved("unsupported", missing ?? unpublished ?? name, "an actual callable reference has no admitted supplied consumer", [owner]))
  );
}

/** Complete observed consumers of one actual callable; sparse or escaping reference coverage refuses. */
export function readObservedCallableConsumers(
  owner: MorphNode,
  program: CallReturnProgram,
  context?: ReturnedValueContext,
): ReferenceFact<readonly CallReturnObservation[]> {
  const epoch = suppliedEpochRefusal(owner, program);
  if (epoch !== undefined) {
    return epoch;
  }
  if (
    !(Node.isFunctionDeclaration(owner) || Node.isArrowFunction(owner) || Node.isFunctionExpression(owner) || Node.isMethodDeclaration(owner)) ||
    owner.getBody() === undefined
  ) {
    return unresolved("missing", owner, "the callable has no authored use body", [owner]);
  }
  if (!program.referencesObserved) {
    return unresolved("missing", owner, "callable reference coverage was not supplied", [owner]);
  }
  const name = callableName(owner);
  const containing = !Node.isIdentifier(name) ? program.suppliedCallableUses?.(owner) : undefined;
  if (containing?.kind === "unresolved") {
    return containing;
  }
  const escaped = program.escapingReferences.get(owner.compilerNode)?.[0];
  if (escaped !== undefined) {
    return escaped;
  }
  const reference = Node.isIdentifier(name) ? callableReferenceRefusal(name, owner, { program, context }) : undefined;
  if (reference !== undefined) {
    return reference;
  }
  const current = suppliedEpochRefusal(owner, program) ?? program.escapingReferences.get(owner.compilerNode)?.[0];
  const callers = program.callers.get(owner.compilerNode) ?? [];
  return (
    current ??
    (callers.length === 0
      ? unresolved("missing", owner, "the callable has no observed supplied consumers", [owner])
      : { kind: "resolved", value: callers, trace: { declarations: [owner], origin: owner } })
  );
}

/** Actual supplied alternatives of a formal, including omitted optional values; annotation supplies no origin. */
export function readSuppliedParameter(
  node: MorphNode,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  program: CallReturnProgram | undefined,
  context?: ReturnedValueContext,
): ReferenceFact<readonly SuppliedValueSource[]> {
  const privateInvalid = context === undefined ? undefined : suppliedValueContextRefusal(node, context, readCallReturnProgram, program);
  if (privateInvalid !== undefined) {
    return privateInvalid;
  }
  const epoch = suppliedEpochRefusal(node, program);
  if (epoch !== undefined) {
    return epoch;
  }
  const parameter = (Node.isIdentifier(node) ? lexicalReferenceSymbol(node) : node.getSymbol())?.getValueDeclaration();
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
  const callers =
    context?.inheritedReadPremise !== undefined
      ? privateSuppliedConsumers(
          owner,
          { name: callableName(owner), program, context },
          {
            admit: readCallReturnProgram,
            observed: readObservedCallableConsumers,
            references: callableReferenceRefusal,
          },
        )
      : readObservedCallableConsumers(owner, program, context);
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
    value: alternatives.flatMap(({ caller, argument }) => {
      if (argument.kind === "unresolved") {
        return [];
      }
      const actualBindings = readCallBindings(caller.call, owner, bindings);
      const ordinary = {
        kind: "observed" as const,
        observation: caller,
        parameter,
        argument: caller.call.getArguments()[index],
        value: argument.value ?? node,
      };
      const privateSupply = privateValueSupply(ordinary, { owner, program, context, bindings: actualBindings });
      const supply = privateSupply ?? (argument.value === undefined ? undefined : ordinary);
      return [
        {
          value: ordinary.value,
          path: [],
          present: argument.value !== undefined,
          bindings: actualBindings,
          ...(privateSupply === undefined ? {} : { privateSupplies: [...(context?.privateSupplies ?? []), privateSupply] }),
          ...(supply === undefined ? {} : { supply }),
        },
      ];
    }),
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

/** Native reference traversal may reach an uncaptured source, but only its existing capture owner can admit it. */
export function readCallReturnReference(reference: MorphNode, binding: MorphNode, program: CallReturnProgram): ReferenceFact<CallReturnProgram> {
  const current = readCallReturnProgram(reference, { programs: [program] });
  if (current.kind === "resolved" || reference.wasForgotten() || program.sources.has(reference.getSourceFile())) {
    return current;
  }
  const demanded = program.demandReferenceSource?.(reference, binding);
  if (demanded === undefined) {
    return current;
  }
  return demanded.kind === "unresolved" ? demanded : readCallReturnProgram(reference, { programs: [program] });
}

/** Exact native world/epoch admission precedes every use of captured callable/return nodes. */
export function readCallReturnProgram(node: MorphNode, observations: CallReturnObservations): ReferenceFact<CallReturnProgram> {
  if (node.wasForgotten()) {
    return unresolved("unsupported", node, "the captured value node was forgotten");
  }
  const source = node.getSourceFile();
  const project = node.getProject();
  let revision: object | undefined;
  let selectedSources: CallReturnProgram["sources"] | undefined;
  let nativeProgram: ts.Program | undefined;
  let unstableMembership = false;
  let program: CallReturnProgram | undefined;
  for (const candidate of observations.programs) {
    selectedSources = candidate.sources;
    nativeProgram = candidate.program;
    const freshness = RefinementMap.freshness(candidate.sources);
    revision = freshness?.revision();
    if (freshness === undefined) {
      candidate.callableContext?.untrackedRead?.();
    }
    const present = candidate.sources.has(source);
    unstableMembership =
      candidate.sources !== selectedSources || candidate.program !== nativeProgram || (revision !== undefined && freshness?.revision() !== revision);
    if (present || unstableMembership) {
      program = candidate;
      break;
    }
  }
  if (
    program === undefined ||
    unstableMembership ||
    !capturedSourcesCurrent(program.sources, project, program.program, revision) ||
    program.sources !== selectedSources ||
    program.program !== nativeProgram
  ) {
    return unresolved("unsupported", node, "call/return observations belong to another compiler world or a stale source/program epoch");
  }
  return { kind: "resolved", value: program, trace: { declarations: [], origin: node } };
}
