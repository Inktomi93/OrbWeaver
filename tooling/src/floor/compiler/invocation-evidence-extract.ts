// Finite requested invocation/value facets close over effective arguments in their actual native world.
// Canonical floor readers own resolution; this adapter captures no policy judgment or compiler owner.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readModuleNamespaceDeclarations } from "../code-facts/module-namespace.ts";
import {
  readStaticString,
  referenceResolutionServices,
  resolveGlobalMemberOrigin,
  resolveModuleMemberOrigin,
  resolveStableExpression,
} from "../code-facts/reference-fact.ts";
import { lexicalReferenceSymbol } from "../code-facts/reference-fact-alias.ts";
import type { CallableBinding, CallableInvocationFact, GlobalMemberOrigin, ModuleMemberOrigin, ReferenceFact } from "../code-facts/reference-fact-contract.ts";
import { readCallableBinding, readCallableInvocation } from "../code-facts/reference-fact-invocation.ts";
import type {
  CapturedInvocationEvidence,
  InventoryInvocationEvidence,
  InventoryInvocationPlan,
  InventoryInvocationRefusal,
  InventoryInvocationTrace,
  InventorySpan,
} from "../code-facts/semantic-inventory-contract.ts";
import { invocationEvidenceSchema, invocationPlanSchema } from "../code-facts/semantic-inventory-contract.ts";
import { descendantsOfKind } from "./ts-workspace.ts";

/** Capture only requested facets and their finite canonical callee/argument dependencies. */
export function captureInvocationEvidence(node: MorphNode, rawPlan: InventoryInvocationPlan): CapturedInvocationEvidence {
  const plan = invocationPlanSchema.parse(rawPlan);
  const modules = new Map<MorphNode, ReferenceFact<ModuleMemberOrigin>>();
  const globals = new Map<MorphNode, ReferenceFact<GlobalMemberOrigin>>();
  const callableBindings = new Map<MorphNode, ReferenceFact<CallableBinding>>();
  const undefinedMembers = new Map<MorphNode, boolean>();
  const namespaces = new Map<MorphNode, readonly MorphNode[]>();
  const strings = new Map<MorphNode, ReferenceFact<string>>();
  const stableValues = new Map<MorphNode, ReferenceFact<MorphNode>>();
  const canonicalValues = new Map<MorphNode, ReferenceFact<MorphNode>>();
  const sources = new Set<SourceFile>([node.getSourceFile()]);
  const readers: Record<InventoryInvocationPlan["facets"][number], (subject: MorphNode) => void> = {
    module: (subject) => captureOnce(modules, subject, resolveModuleMemberOrigin),
    global: (subject) => captureOnce(globals, subject, resolveGlobalMemberOrigin),
    binding: (subject) => {
      captureOnce(callableBindings, subject, readCallableBinding);
      const fact = callableBindings.get(subject);
      if (fact?.kind === "resolved") {
        capture(fact.value.callee, ["module"]);
      }
    },
    undefined: (subject) => captureOnce(undefinedMembers, subject, undefinedMember),
    namespace: (subject) => captureOnce(namespaces, subject, readModuleNamespaceDeclarations),
    string: (subject) => captureOnce(strings, subject, readStaticString),
    stable: (subject) => captureOnce(stableValues, subject, resolveStableExpression),
  };
  const capture = (subject: MorphNode, facets: InventoryInvocationPlan["facets"]): void => {
    sources.add(subject.getSourceFile());
    for (const facet of facets) {
      readers[facet](subject);
    }
    const module = modules.get(subject);
    if (facets.includes("stable") && module?.kind === "resolved" && module.value.canonical.kind === "project") {
      captureCanonicalVariable(module.value.canonical.declaration, canonicalValues, sources);
    }
  };
  const invocation = captureRequestedInvocation(node, plan, capture);
  closeRelatedInvocationSources(sources);
  const admitted = (subject: MorphNode): void => {
    if (!sources.has(subject.getSourceFile()) || subject.wasForgotten()) {
      throw new Error("native invocation related value is outside its closed source context");
    }
  };
  return {
    invocation,
    modules,
    globals,
    callableBindings,
    undefinedMembers,
    namespaces,
    strings,
    stableValues,
    canonicalValues,
    sources: [...sources],
    declarations: (subject): readonly MorphNode[] => {
      admitted(subject);
      if (!Node.isIdentifier(subject)) {
        throw new Error("native invocation binding is not an identifier");
      }
      return lexicalReferenceSymbol(subject)?.getDeclarations() ?? [];
    },
    computedName: (subject): ReferenceFact<string> => {
      admitted(subject);
      return referenceResolutionServices.readComputedName(subject);
    },
  };
}

/** Binding callbacks and serialized delivery share the same finite upstream source demand. */
function closeRelatedInvocationSources(sources: Set<SourceFile>): void {
  for (const source of sources) {
    for (const identifier of descendantsOfKind(source, SyntaxKind.Identifier)) {
      const declarations = lexicalReferenceSymbol(identifier)?.getDeclarations() ?? [];
      for (const declaration of declarations) {
        if (Node.isVariableDeclaration(declaration) && declaration.getInitializer() !== undefined) {
          sources.add(declaration.getSourceFile());
        }
      }
    }
  }
}

function captureOnce<T>(map: Map<MorphNode, T>, node: MorphNode, read: (node: MorphNode) => T): void {
  if (!map.has(node)) {
    map.set(node, read(node));
  }
}
function undefinedMember(node: MorphNode): boolean {
  const type = node.getType();
  return type.isUndefined() || type.getUnionTypes().some((part) => part.isUndefined());
}
function captureCanonicalVariable(declaration: MorphNode, values: Map<MorphNode, ReferenceFact<MorphNode>>, sources: Set<SourceFile>): void {
  if (Node.isVariableDeclaration(declaration) && !values.has(declaration)) {
    sources.add(declaration.getSourceFile());
    values.set(declaration, resolveStableExpression(declaration.getNameNode()));
  }
}
function captureRequestedInvocation(
  node: MorphNode,
  plan: InventoryInvocationPlan,
  capture: (node: MorphNode, facets: InventoryInvocationPlan["facets"]) => void,
): CallableInvocationFact | undefined {
  if (plan.mode === "value") {
    capture(node, plan.facets);
    return;
  }
  if (!(Node.isCallExpression(node) || Node.isNewExpression(node))) {
    throw new Error("native invocation demand is not a call or construct expression");
  }
  const invocation = readCallableInvocation(node);
  capture(node.getExpression(), plan.facets);
  if (invocation.kind === "resolved") {
    capture(invocation.value.callee, plan.facets);
    captureArgumentProfiles(invocation.value.arguments, plan, capture);
  }
  return invocation;
}
function captureArgumentProfiles(
  arguments_: ReferenceFact<readonly MorphNode[]>,
  plan: InventoryInvocationPlan,
  capture: (node: MorphNode, facets: InventoryInvocationPlan["facets"]) => void,
): void {
  if (arguments_.kind !== "resolved") {
    return;
  }
  for (const projection of plan.arguments) {
    const argument = arguments_.value[projection.index];
    if (argument !== undefined) {
      capture(argument, projection.facets);
    }
  }
}

function wireFact<T, V>(
  fact: ReferenceFact<T>,
  value: (input: T) => V,
  span: (node: MorphNode) => InventorySpan,
): { readonly kind: "resolved"; readonly value: V; readonly trace: InventoryInvocationTrace } | InventoryInvocationRefusal {
  const trace = { origin: span(fact.trace.origin), declarations: fact.trace.declarations.map(span) };
  if (fact.kind === "resolved") {
    return { kind: fact.kind, value: value(fact.value), trace };
  }
  return {
    kind: fact.kind,
    reason: fact.reason,
    detail: fact.detail,
    node: span(fact.node),
    trace,
    ...("capture" in fact && fact.capture === "native-bind" ? { capture: "native-bind" as const } : {}),
  };
}

/** Encode span-valued facts without replacing canonical node/refusal semantics. */
export function encodeInvocationEvidence(
  node: MorphNode,
  plan: InventoryInvocationPlan,
  evidence: CapturedInvocationEvidence,
  span: (node: MorphNode) => InventorySpan,
): InventoryInvocationEvidence {
  const origin = (value: ModuleMemberOrigin | GlobalMemberOrigin): object =>
    value.kind === "global"
      ? { ...value, declarations: value.declarations.map(span) }
      : {
          ...value,
          declaration: span(value.declaration),
          canonical:
            value.canonical.kind === "project"
              ? { ...value.canonical, sourceFile: span(value.canonical.sourceFile), declaration: span(value.canonical.declaration) }
              : { ...value.canonical, declaration: span(value.canonical.declaration) },
        };
  const binding = (value: CallableBinding): object => ({
    target: origin(value.target),
    callee: span(value.callee),
    arguments: wireFact(value.arguments, (nodes) => nodes.map(span), span),
    ...("invocation" in value && value.invocation === "bind" ? { invocation: "bind" } : {}),
  });
  const profiles = new Map<
    MorphNode,
    {
      node: InventorySpan;
      module?: object;
      global?: true;
      binding?: object;
      undefined?: boolean;
      namespace?: InventorySpan[];
      string?: object;
      stable?: object;
      canonicalValue?: { declaration: InventorySpan; fact: object };
    }
  >();
  const profile = (subject: MorphNode): NonNullable<ReturnType<typeof profiles.get>> => {
    const current = profiles.get(subject) ?? { node: span(subject) };
    profiles.set(subject, current);
    return current;
  };
  for (const [subject, fact] of evidence.modules) {
    profile(subject).module = wireFact(fact, origin, span);
  }
  for (const subject of evidence.globals.keys()) {
    profile(subject).global = true;
  }
  for (const [subject, fact] of evidence.callableBindings) {
    profile(subject).binding = wireFact(fact, binding, span);
  }
  for (const [subject, value] of evidence.undefinedMembers) {
    profile(subject).undefined = value;
  }
  for (const [subject, value] of evidence.namespaces) {
    profile(subject).namespace = value.map(span);
  }
  for (const [subject, fact] of evidence.strings) {
    profile(subject).string = wireFact(fact, (value) => value, span);
  }
  for (const [subject, fact] of evidence.stableValues) {
    profile(subject).stable = wireFact(fact, span, span);
  }
  for (const [subject, module] of evidence.modules) {
    const canonical = canonicalVariableFact(module, evidence, span);
    if (canonical !== undefined) {
      profile(subject).canonicalValue = canonical;
    }
  }
  const invocation =
    evidence.invocation === undefined ? null : wireFact(evidence.invocation, (value) => ({ ...binding(value), invocation: value.invocation }), span);
  return invocationEvidenceSchema.parse({
    query: { ...plan, node: span(node) },
    callee: plan.mode === "invocation" && (Node.isCallExpression(node) || Node.isNewExpression(node)) ? span(node.getExpression()) : null,
    invocation,
    profiles: [...profiles.values()],
    sources: [],
  });
}

function canonicalVariableFact(
  module: ReferenceFact<ModuleMemberOrigin>,
  evidence: CapturedInvocationEvidence,
  span: (node: MorphNode) => InventorySpan,
): { declaration: InventorySpan; fact: object } | undefined {
  if (module.kind !== "resolved" || module.value.canonical.kind !== "project") {
    return;
  }
  const declaration = module.value.canonical.declaration;
  const fact = evidence.canonicalValues.get(declaration);
  return fact === undefined ? undefined : { declaration: span(declaration), fact: wireFact(fact, span, span) };
}
