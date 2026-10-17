// Conditional supplies belong to one live effect trial and never publish captured targets or callers.
import type { Identifier, Node as MorphNode, ts } from "ts-morph";
import { Node } from "ts-morph";
import { referenceResolutionServices, resolveModuleMemberOrigin } from "./reference-fact.ts";
import { lexicalReferenceSymbol } from "./reference-fact-alias.ts";
import type {
  CallReturnObservation,
  CallReturnProgram,
  NativeNamespaceAliasInputs,
  ObservedValueSupply,
  PrivateValueSupply,
  ReferenceFact,
  ReturnedValueContext,
  UnresolvedReferenceFact,
} from "./reference-fact-contract.ts";
import { unresolved } from "./type-member-origin-core.ts";

interface PrivateSupplyServices {
  readonly admit: typeof import("./call-supplied.ts").readCallReturnProgram;
  readonly observed: typeof import("./call-supplied.ts").readObservedCallableConsumers;
  readonly references: (
    name: Identifier,
    owner: MorphNode,
    inputs: NativeNamespaceAliasInputs,
    calls: Map<ts.CallExpression, CallReturnObservation>,
  ) => UnresolvedReferenceFact | undefined;
}

function privateCalleeRefusal(use: Identifier, binding: Identifier, owner: MorphNode): UnresolvedReferenceFact | undefined {
  if (lexicalReferenceSymbol(use)?.compilerSymbol !== lexicalReferenceSymbol(binding)?.compilerSymbol) {
    const target = resolveModuleMemberOrigin(use);
    const useWrites = referenceResolutionServices.inspectReferenceWrites(use);
    if (target.kind === "unresolved") {
      return target;
    }
    if (
      useWrites.kind === "unresolved" ||
      target.value.canonical.kind !== "project" ||
      target.value.memberPath.length > 0 ||
      target.value.canonical.declaration.compilerNode !== owner.compilerNode
    ) {
      return useWrites.kind === "unresolved" ? useWrites : unresolved("ambiguous", use, "the private consumer has a different native lexical callee");
    }
  }
  return undefined;
}

/** The shared alias walk’s container conveniences do not prove a private callable identity. */
export function privateSuppliedEscape(use: MorphNode): boolean {
  const parent = use.getParent();
  return (
    Node.isSpreadElement(parent) || ((Node.isPropertyAccessExpression(parent) || Node.isElementAccessExpression(parent)) && parent.getExpression() === use)
  );
}

/** Exact existing direct-call syntax supplies no positional argument after an unexpanded spread. */
export function privateSuppliedCall(
  use: MorphNode,
  binding: Identifier,
  inputs: { readonly owner: MorphNode; readonly program: CallReturnProgram; readonly admit: typeof import("./call-supplied.ts").readCallReturnReference },
): ReferenceFact<CallReturnObservation> | undefined {
  const { owner, program, admit } = inputs;
  const call = use.getParent();
  if (!(Node.isIdentifier(use) && Node.isCallExpression(call)) || call.getExpression() !== use || call.hasQuestionDotToken()) {
    return;
  }
  if (call.getArguments().some(Node.isSpreadElement)) {
    return unresolved("unsupported", call, "a private consumer has no closed positional arguments after a spread");
  }
  const stable = referenceResolutionServices.inspectReferenceWrites(binding);
  const admitted = stable.kind === "unresolved" ? stable : admit(use, binding, program);
  if (admitted.kind === "unresolved") {
    return admitted;
  }
  const callee = privateCalleeRefusal(use, binding, owner);
  if (callee !== undefined) {
    return callee;
  }
  const observation = program.byCall.get(call.compilerNode);
  if (observation === undefined || observation.call !== call) {
    return unresolved("missing", call, "the private consumer has no actual captured call observation");
  }
  return { kind: "resolved", value: observation, trace: { declarations: [owner], origin: use } };
}

/** Close conditional consumers with the ordinary owner’s complete reference traversal. */
export function privateSuppliedConsumers(
  owner: MorphNode,
  inputs: { readonly name: MorphNode | undefined; readonly program: CallReturnProgram; readonly context: ReturnedValueContext },
  services: PrivateSupplyServices,
): ReferenceFact<readonly CallReturnObservation[]> {
  const { name, program, context } = inputs;
  const invalid = suppliedValueContextRefusal(owner, context, services.admit);
  if (invalid !== undefined) {
    return invalid;
  }
  if (!(Node.isIdentifier(name) && (Node.isFunctionDeclaration(owner) || Node.isFunctionExpression(owner) || Node.isArrowFunction(owner)))) {
    return services.observed(owner, program, context);
  }
  if (!program.referencesObserved || owner.getBody() === undefined) {
    return unresolved("missing", owner, "private supply has no complete authored reference/body coverage");
  }
  const escaped = program.escapingReferences.get(owner.compilerNode)?.[0];
  if (escaped !== undefined) {
    return escaped;
  }
  const calls = new Map<ts.CallExpression, CallReturnObservation>();
  const refused = services.references(name, owner, { program, context }, calls);
  if (refused !== undefined) {
    return refused;
  }
  const current = suppliedValueContextRefusal(owner, context, services.admit) ?? program.escapingReferences.get(owner.compilerNode)?.[0];
  if (current !== undefined) {
    return current;
  }
  for (const caller of program.callers.get(owner.compilerNode) ?? []) {
    calls.set(caller.call.compilerNode, caller);
  }
  return calls.size === 0
    ? unresolved("missing", owner, "the private supplier has no complete actual consumers")
    : { kind: "resolved", value: [...calls.values()], trace: { declarations: [owner], origin: owner } };
}

function privateFrameCurrent(supply: PrivateValueSupply, context: Pick<ReturnedValueContext, "bindings">, admit: PrivateSupplyServices["admit"]): boolean {
  const program = supply.program;
  if (
    !program.referencesObserved ||
    program.escapingReferences.get(supply.owner.compilerNode)?.[0] !== undefined ||
    supply.nodes.some(
      ({ node: source, native }) => source.wasForgotten() || source.compilerNode !== native || admit(source, { programs: [program] }).kind === "unresolved",
    ) ||
    !(
      Node.isFunctionDeclaration(supply.owner) ||
      Node.isFunctionExpression(supply.owner) ||
      Node.isArrowFunction(supply.owner) ||
      Node.isMethodDeclaration(supply.owner)
    ) ||
    supply.parameter.getParent() !== supply.owner ||
    program.byCall.get(supply.observation.call.compilerNode) !== supply.observation ||
    supply.observation.call.getArguments()[supply.owner.getParameters().indexOf(supply.parameter)] !== supply.argument ||
    supply.bindings.size !== supply.bindingPairs.length ||
    supply.bindingPairs.some(([formal, actual]) => supply.bindings.get(formal) !== actual || context.bindings.get(formal) !== actual)
  ) {
    return false;
  }
  return true;
}

function privateSupplyRefusal(
  node: MorphNode,
  supply: PrivateValueSupply,
  context: Pick<ReturnedValueContext, "program" | "inheritedReadPremise" | "bindings">,
  admit: PrivateSupplyServices["admit"],
): UnresolvedReferenceFact | undefined {
  const program = context.program;
  const premise = context.inheritedReadPremise;
  if (program !== supply.program || premise !== supply.premise || program.program !== supply.nativeProgram) {
    return unresolved("unsupported", node, "a private supply continuation changed its capture or premise");
  }
  const live = supply.premise.require(node, program);
  if (live.kind === "unresolved") {
    return live;
  }
  if (!privateFrameCurrent(supply, context, admit)) {
    return unresolved("unsupported", node, "a private supplied frame is outside its actual native observation or source epoch");
  }
  return undefined;
}

/** Validate every retained private frame before its supplied bindings can be consumed. */
export function suppliedValueContextRefusal(
  node: MorphNode,
  context: Pick<ReturnedValueContext, "program" | "inheritedReadPremise" | "privateSupplies" | "bindings">,
  admit: PrivateSupplyServices["admit"],
  expected: CallReturnProgram | undefined = context.program,
): UnresolvedReferenceFact | undefined {
  const program = context.program;
  const premise = context.inheritedReadPremise;
  if (premise !== undefined) {
    if (program === undefined || program !== expected) {
      return unresolved("missing", node, "a private supply continuation has no live captured trial");
    }
    const live = premise.require(node, program);
    if (live.kind === "unresolved") {
      return live;
    }
    if (program.inheritedReadTrialActive?.() !== true) {
      return unresolved("unsupported", node, "a private supply continuation has no live captured trial");
    }
  }
  for (const supply of context.privateSupplies ?? []) {
    const invalid = privateSupplyRefusal(node, supply, context, admit);
    if (invalid !== undefined) {
      return invalid;
    }
  }
  return undefined;
}

/** Snapshot the real default/argument frame without retaining an unconditional callable judgment. */
export function privateValueSupply(
  ordinary: ObservedValueSupply,
  inputs: {
    readonly owner: MorphNode;
    readonly program: CallReturnProgram;
    readonly context: ReturnedValueContext | undefined;
    readonly bindings: ReadonlyMap<MorphNode, MorphNode>;
  },
): PrivateValueSupply | undefined {
  const { owner, program, context, bindings } = inputs;
  const premise = context?.inheritedReadPremise;
  if (premise === undefined) {
    return;
  }
  return {
    ...ordinary,
    kind: "private",
    owner,
    program,
    nativeProgram: program.program,
    premise,
    bindings,
    bindingPairs: [...bindings],
    nodes: [
      ...new Set([
        owner,
        ordinary.parameter,
        ordinary.observation.call,
        ordinary.value,
        ...(ordinary.argument === undefined ? [] : [ordinary.argument]),
        ...bindings.keys(),
        ...bindings.values(),
      ]),
    ].map((bound) => ({ node: bound, native: bound.compilerNode })),
  };
}
