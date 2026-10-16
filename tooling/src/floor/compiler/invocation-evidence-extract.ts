// Finite requested invocation/value facets close over effective arguments in their actual native world.
// Canonical floor readers own resolution; this adapter captures no policy judgment or compiler owner.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { NativeAuthoredValueProjection } from "../code-facts/authored-value-projection.ts";
import { captureAuthoredValueProjection } from "../code-facts/authored-value-projection.ts";
import { encodeAuthoredValueProjection } from "../code-facts/authored-value-projection-codec.ts";
import type { IndexedCallParameters } from "../code-facts/drizzle-column-read-contract.ts";
import { readIndexedCallParameters } from "../code-facts/drizzle-column-reads.ts";
import type { DrizzleWrite } from "../code-facts/drizzle-columns.ts";
import { readDrizzleWrite } from "../code-facts/drizzle-columns.ts";
import { readModuleNamespaceDeclarations } from "../code-facts/module-namespace.ts";
import { encodeModuleOrigin } from "../code-facts/module-origin-codec.ts";
import { captureOrdinaryObservations } from "../code-facts/ordinary-observations.ts";
import { encodeOrdinaryObservations } from "../code-facts/ordinary-observations-codec.ts";
import type { OrdinaryObservationDemand } from "../code-facts/ordinary-observations-contract.ts";
import type { InventoryAuthoredValueProjection, InventoryTypeProjection } from "../code-facts/projection-inventory-contract.ts";
import { wireReferenceFact } from "../code-facts/projection-reference-codec.ts";
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
import type { SchemaQuery } from "../code-facts/schema-model-contract.ts";
import type {
  CapturedInvocationEvidence,
  InventoryInvocationEvidence,
  InventoryInvocationPlan,
  InventorySpan,
} from "../code-facts/semantic-inventory-contract.ts";
import { invocationEvidenceSchema, invocationPlanSchema } from "../code-facts/semantic-inventory-contract.ts";
import { captureTypeObservations } from "../code-facts/type-observations.ts";
import { encodeTypeObservations } from "../code-facts/type-observations-codec.ts";
import type { TypeObservationDemand } from "../code-facts/type-observations-contract.ts";
import { captureTypeProjection } from "../code-facts/type-projection.ts";
import { encodeTypeProjection } from "../code-facts/type-projection-codec.ts";
import type { NativeTypeProjection } from "../code-facts/type-projection-contract.ts";
import { captureColumnRowObservation, captureStoredValueObservation } from "../code-facts/value-observation.ts";
import { mapColumnRowObservation, mapStoredValueObservation } from "../code-facts/value-observation-codec.ts";
import type { NativeColumnRowObservation, ProjectedStoredValueShape } from "../code-facts/value-observation-contract.ts";
import { descendantsOfKind } from "./ts-workspace.ts";

/** Capture only requested facets and their finite canonical callee/argument dependencies. */
export function captureInvocationEvidence(
  node: MorphNode,
  rawPlan: InventoryInvocationPlan,
  ordinary?: {
    readonly demand: OrdinaryObservationDemand;
    readonly schema: SchemaQuery | undefined;
    readonly basis?: import("../code-facts/drizzle-inventory-contract.ts").InventorySchemaBasis | null;
  },
  typeDemand?: TypeObservationDemand,
): CapturedInvocationEvidence {
  const plan = invocationPlanSchema.parse(rawPlan);
  const modules = new Map<MorphNode, ReferenceFact<ModuleMemberOrigin>>();
  const globals = new Map<MorphNode, ReferenceFact<GlobalMemberOrigin>>();
  const callableBindings = new Map<MorphNode, ReferenceFact<CallableBinding>>();
  const undefinedMembers = new Map<MorphNode, boolean>();
  const namespaces = new Map<MorphNode, readonly MorphNode[]>();
  const strings = new Map<MorphNode, ReferenceFact<string>>();
  const stableValues = new Map<MorphNode, ReferenceFact<MorphNode>>();
  const canonicalValues = new Map<MorphNode, ReferenceFact<MorphNode>>();
  const typeProjections = new Map<MorphNode, NativeTypeProjection>();
  const authoredValues = new Map<MorphNode, NativeAuthoredValueProjection>();
  const storedValues = new Map<MorphNode, ProjectedStoredValueShape>();
  const columnRows = new Map<MorphNode, NativeColumnRowObservation>();
  const drizzleWrites = new Map<MorphNode, ReferenceFact<DrizzleWrite | null>>();
  const indexedParameters = new Map<MorphNode, readonly IndexedCallParameters[]>();
  const sources = new Set<SourceFile>([node.getSourceFile()]);
  const related = (subject: MorphNode): MorphNode => {
    sources.add(subject.getSourceFile());
    return subject;
  };
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
    "type-projection": (subject) =>
      captureOnce(typeProjections, subject, (value) => {
        if (plan.typeProjection === undefined) {
          throw new Error("native type projection demand is unavailable");
        }
        return captureTypeProjection(value, plan.typeProjection);
      }),
    "authored-value": (subject) => captureOnce(authoredValues, subject, captureAuthoredValueProjection),
    "stored-value": (subject) => captureOnce(storedValues, subject, (value) => mapStoredValueObservation(captureStoredValueObservation(value), related)),
    "row-column": (subject) => captureOnce(columnRows, subject, (value) => mapColumnRowObservation(captureColumnRowObservation(value), related)),
    "drizzle-write": (subject) => captureOnce(drizzleWrites, subject, (value) => captureWrite(value, related)),
    "indexed-parameters": (subject) =>
      captureOnce(indexedParameters, subject, (value) => {
        if (!Node.isCallExpression(value)) {
          throw new Error("native indexed-parameter demand is not a call");
        }
        const indexed = readIndexedCallParameters(value);
        for (const item of indexed) {
          related(item.node);
        }
        return indexed;
      }),
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
  if (plan.mode === "observations" && ordinary === undefined) {
    throw new Error("native ordinary observation demand has no captured owner");
  }
  const observations =
    ordinary === undefined
      ? undefined
      : captureOrdinaryObservations(ordinary.demand, {
          query: ordinary.schema,
          related,
          profile: (subject) =>
            capture(subject, ["module", "global", "string", "stable", "authored-value", ...(Node.isCallExpression(subject) ? ["drizzle-write" as const] : [])]),
          anchor: node,
        });
  if ((plan.mode === "types") !== (typeDemand !== undefined)) {
    throw new Error("native type observation demand has no captured owner");
  }
  const typeObservations =
    typeDemand === undefined
      ? undefined
      : captureTypeObservations(typeDemand, {
          anchor: Node.isSourceFile(node) ? node : node.getSourceFile(),
          admit: (subject): void => {
            related(subject);
          },
          profile: (subject, facets) => capture(subject, [...facets]),
        });
  const invocation = plan.mode === "observations" || plan.mode === "types" ? undefined : captureRequestedInvocation(node, plan, capture);
  if (plan.mode !== "observations" && plan.mode !== "types") {
    closeRelatedInvocationSources(sources);
  }
  const admitted = (subject: MorphNode): void => {
    if (!sources.has(subject.getSourceFile()) || subject.wasForgotten()) {
      throw new Error("native invocation related value is outside its closed source context");
    }
  };
  return {
    ...(observations === undefined ? {} : { observations, observationBasis: ordinary?.basis ?? null }),
    ...(typeObservations === undefined ? {} : { typeObservations }),
    invocation,
    modules,
    globals,
    callableBindings,
    undefinedMembers,
    namespaces,
    strings,
    stableValues,
    canonicalValues,
    typeProjections,
    authoredValues,
    storedValues,
    columnRows,
    drizzleWrites,
    indexedParameters,
    captureSource: (subject): void => {
      related(subject);
    },
    get sources(): readonly SourceFile[] {
      return [...sources];
    },
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

/** Encode span-valued facts without replacing canonical node/refusal semantics. */
export function encodeInvocationEvidence(
  node: MorphNode,
  plan: InventoryInvocationPlan,
  evidence: CapturedInvocationEvidence,
  spanNode: (node: MorphNode) => InventorySpan,
): InventoryInvocationEvidence {
  const span = (subject: MorphNode): InventorySpan => {
    if (plan.mode === "observations" || plan.mode === "types") {
      evidence.captureSource?.(subject);
    }
    return spanNode(subject);
  };
  const origin = (value: ModuleMemberOrigin | GlobalMemberOrigin): object =>
    value.kind === "global" ? { ...value, declarations: value.declarations.map(span) } : encodeModuleOrigin(value, span);
  const binding = (value: CallableBinding): object => ({
    target: origin(value.target),
    callee: span(value.callee),
    arguments: wireReferenceFact(value.arguments, (nodes) => nodes.map(span), span),
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
      "type-projection"?: InventoryTypeProjection;
      "authored-value"?: InventoryAuthoredValueProjection;
      "stored-value"?: InventoryInvocationEvidence["profiles"][number]["stored-value"];
      "row-column"?: InventoryInvocationEvidence["profiles"][number]["row-column"];
      "drizzle-write"?: InventoryInvocationEvidence["profiles"][number]["drizzle-write"];
      "indexed-parameters"?: InventoryInvocationEvidence["profiles"][number]["indexed-parameters"];
    }
  >();
  const profile = (subject: MorphNode): NonNullable<ReturnType<typeof profiles.get>> => {
    const current = profiles.get(subject) ?? { node: span(subject) };
    profiles.set(subject, current);
    return current;
  };
  for (const [subject, fact] of evidence.modules) {
    profile(subject).module = wireReferenceFact(fact, origin, span);
  }
  for (const subject of evidence.globals.keys()) {
    profile(subject).global = true;
  }
  for (const [subject, fact] of evidence.callableBindings) {
    profile(subject).binding = wireReferenceFact(fact, binding, span);
  }
  for (const [subject, value] of evidence.undefinedMembers) {
    profile(subject).undefined = value;
  }
  for (const [subject, value] of evidence.namespaces) {
    profile(subject).namespace = value.map(span);
  }
  for (const [subject, fact] of evidence.strings) {
    profile(subject).string = wireReferenceFact(fact, (value) => value, span);
  }
  for (const [subject, fact] of evidence.stableValues) {
    profile(subject).stable = wireReferenceFact(fact, span, span);
  }
  encodeDataProfiles(evidence, plan, span, profile);
  for (const [subject, module] of evidence.modules) {
    const canonical = canonicalVariableFact(module, evidence, span);
    if (canonical !== undefined) {
      profile(subject).canonicalValue = canonical;
    }
  }
  const invocation =
    evidence.invocation === undefined ? null : wireReferenceFact(evidence.invocation, (value) => ({ ...binding(value), invocation: value.invocation }), span);
  return invocationEvidenceSchema.parse({
    ...encodeOrdinaryAttachment(evidence, span),
    ...(evidence.typeObservations === undefined ? {} : { typeObservations: encodeTypeObservations(evidence.typeObservations, span) }),
    query: { ...plan, node: span(node) },
    callee: plan.mode === "invocation" && (Node.isCallExpression(node) || Node.isNewExpression(node)) ? span(node.getExpression()) : null,
    invocation,
    profiles: [...profiles.values()],
    sources: [],
  });
}

function encodeOrdinaryAttachment(
  evidence: CapturedInvocationEvidence,
  span: (node: MorphNode) => InventorySpan,
): Pick<InventoryInvocationEvidence, "observations" | "observationBasis"> {
  return evidence.observations === undefined
    ? {}
    : { observationBasis: evidence.observationBasis ?? null, observations: encodeOrdinaryObservations(evidence.observations, span) };
}

function encodeDataProfiles(
  evidence: CapturedInvocationEvidence,
  plan: InventoryInvocationPlan,
  span: (node: MorphNode) => InventorySpan,
  profile: (
    node: MorphNode,
  ) => Pick<
    InventoryInvocationEvidence["profiles"][number],
    "type-projection" | "authored-value" | "stored-value" | "row-column" | "drizzle-write" | "indexed-parameters"
  >,
): void {
  for (const [subject, fact] of evidence.typeProjections) {
    if (plan.typeProjection === undefined) {
      throw new Error("native type projection demand is unavailable");
    }
    profile(subject)["type-projection"] = encodeTypeProjection(fact, plan.typeProjection, span);
  }
  for (const [subject, fact] of evidence.authoredValues) {
    profile(subject)["authored-value"] = encodeAuthoredValueProjection(fact, span);
  }
  for (const [subject, fact] of evidence.storedValues) {
    profile(subject)["stored-value"] = mapStoredValueObservation(fact, span);
  }
  for (const [subject, fact] of evidence.columnRows) {
    profile(subject)["row-column"] = mapColumnRowObservation(fact, span);
  }
  for (const [subject, fact] of evidence.drizzleWrites) {
    profile(subject)["drizzle-write"] = wireReferenceFact(
      fact,
      (value) => (value === null ? null : { ...value, target: span(value.target), arg: value.arg === undefined ? null : span(value.arg) }),
      span,
    );
  }
  for (const [subject, fact] of evidence.indexedParameters) {
    profile(subject)["indexed-parameters"] = fact.map((item) => ({ ...item, node: span(item.node) }));
  }
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
  return fact === undefined ? undefined : { declaration: span(declaration), fact: wireReferenceFact(fact, span, span) };
}

function captureWrite(node: MorphNode, related: (node: MorphNode) => MorphNode): ReferenceFact<DrizzleWrite | null> {
  const fact = readDrizzleWrite(node);
  related(fact.trace.origin);
  fact.trace.declarations.forEach(related);
  if (fact.kind === "unresolved") {
    related(fact.node);
  } else if (fact.value !== null) {
    related(fact.value.target);
    if (fact.value.arg !== undefined) {
      related(fact.value.arg);
    }
  }
  return fact;
}
