// One exact ordinary cohort uses the canonical capture owner; no observation Program is reconstructed.
import type { CallExpression, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { observeCallReturns, readCallBindings, readCallClosure, readCallReturns, readCallTarget } from "./call-returns.ts";
import { columnReadAt, nativeRowReadServices, readsSelectRowWith, rowModels } from "./drizzle-row.ts";
import { DrizzleRowOriginRefusal, schemaRowOriginIdentity } from "./drizzle-row-origin.ts";
import { readDrizzleSelection } from "./drizzle-select.ts";
import { readCalledMember, readDrizzleWriteRoots } from "./drizzle-write-chain.ts";
import { readDrizzleWriterSource } from "./drizzle-writer-source.ts";
import type {
  NativeOrdinaryCall,
  NativeOrdinaryNode,
  NativeOrdinaryObservations,
  OrdinaryObservationDemand,
  OrdinaryObservationOwner,
} from "./ordinary-observations-contract.ts";
import { ordinaryTypeSelectionPlan } from "./ordinary-type-questions.ts";
import { resolveLexicalValueDeclaration, resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { lexicalReferenceSymbol } from "./reference-fact-alias.ts";
import { resolveCallableDeclaration, resolveCallableOrigin } from "./reference-fact-call.ts";
import type { CallReturnObservations, ReferenceFact } from "./reference-fact-contract.ts";
import type { SchemaModel, SchemaQuery } from "./schema-model-contract.ts";
import { matchesDeclaredCallTerminal, readCallMemberDeclarationOrigin } from "./type-member-origin.ts";
import { captureTypeProjection, captureTypeSelections } from "./type-projection.ts";
import type { NativeTypeProjection, NativeTypeSelector } from "./type-projection-contract.ts";
import { carryingLiterals, readReturnedValue, referencesOf } from "./value-carrier.ts";

interface SourceClosure {
  readonly pending: Set<MorphNode>;
  readonly add: (node: MorphNode) => void;
  readonly profile: (node: MorphNode) => void;
  readonly profileNodes: Set<MorphNode>;
  readonly sources: Set<SourceFile>;
  readonly members: Map<MorphNode, Set<string>>;
  readonly keys: Set<MorphNode>;
  readonly calls: NativeOrdinaryCall[];
  readonly references: NativeOrdinaryObservations["references"][number][];
}

function callableParameters(owner: MorphNode): readonly MorphNode[] {
  return Node.isFunctionDeclaration(owner) || Node.isFunctionExpression(owner) || Node.isArrowFunction(owner) || Node.isMethodDeclaration(owner)
    ? owner.getParameters()
    : [];
}
function capturedRowIdentity(node: MorphNode): NativeOrdinaryNode["rowIdentity"] {
  try {
    return { kind: "value", value: schemaRowOriginIdentity(node) ?? null };
  } catch (error) {
    if (error instanceof DrizzleRowOriginRefusal) {
      return { kind: "refusal", message: error.message };
    }
    throw error;
  }
}
function observationNode(node: MorphNode): boolean {
  return (
    Node.isExpression(node) ||
    Node.isTypeNode(node) ||
    Node.isVariableDeclaration(node) ||
    Node.isParameterDeclaration(node) ||
    Node.isBindingElement(node) ||
    Node.isFunctionDeclaration(node)
  );
}
function ordinaryRoots(demand: OrdinaryObservationDemand): readonly CallExpression[] {
  return demand.roots.map((node) => {
    if (!Node.isCallExpression(node)) {
      throw new Error("native ordinary root is not an authored call");
    }
    return node;
  });
}
function sourceClosure(owner: OrdinaryObservationOwner): SourceClosure {
  const pending = new Set<MorphNode>();
  const profileNodes = new Set<MorphNode>();
  const add = (node: MorphNode): void => {
    owner.related(node);
    if (pending.has(node)) {
      return;
    }
    pending.add(node);
    if (Node.isSourceFile(node) || node.getSourceFile().isDeclarationFile()) {
      return;
    }
    for (const child of node.getDescendants()) {
      if (observationNode(child)) {
        pending.add(child);
      }
    }
  };
  return {
    pending,
    add,
    profileNodes,
    profile: (node): void => {
      profileNodes.add(node);
      owner.profile(node);
    },
    sources: new Set(),
    members: new Map(),
    keys: new Set(),
    calls: [],
    references: [],
  };
}
function seedSourceClosure(
  state: SourceClosure,
  cohort: {
    readonly demand: OrdinaryObservationDemand;
    readonly roots: readonly CallExpression[];
    readonly closureCalls: readonly CallExpression[];
    readonly initialCalls: readonly CallExpression[];
  },
  observations: CallReturnObservations,
  schema: SchemaModel | undefined,
): void {
  for (const call of cohort.roots) {
    state.add(call);
    const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (declaration !== undefined) {
      state.add(declaration);
    }
  }
  seedReadSources(state, cohort.demand.reads);
  cohort.initialCalls.forEach(state.add);
  cohort.closureCalls.forEach(state.add);
  for (const captured of observations.programs) {
    for (const call of captured.calls) {
      if (call.targets.kind === "resolved") {
        call.targets.value.forEach(state.add);
      }
    }
  }
  seedSchemaSources(state, schema);
}
function seedReadSources(state: SourceClosure, reads: OrdinaryObservationDemand["reads"]): void {
  for (const read of reads) {
    state.add(read.node);
    for (const { literal } of carryingLiterals(read.node)) {
      state.add(literal);
      const parent = literal.getParent();
      if (Node.isArrayLiteralExpression(parent)) {
        state.add(parent);
      }
    }
  }
}
function seedSchemaSources(state: SourceClosure, schema: SchemaModel | undefined): void {
  for (const table of schema?.tables ?? []) {
    state.add(table.declaration);
    for (const column of table.columns) {
      if (column.typeOverride !== null) {
        state.add(column.typeOverride.node);
      }
    }
  }
}

function addMember(state: SourceClosure, node: MorphNode, name: string): void {
  const names = state.members.get(node) ?? new Set<string>();
  names.add(name);
  state.members.set(node, names);
}
function closeBindings(node: MorphNode, state: SourceClosure): void {
  if (Node.isBindingElement(node)) {
    state.add(node.getParent().getParent());
  }
  const stable = resolveStableExpression(node);
  const lexical = resolveLexicalValueDeclaration(node);
  const module = resolveModuleMemberOrigin(node);
  const next = [stable.kind === "resolved" ? stable.value : stable.node, lexical.kind === "resolved" ? lexical.value : lexical.node];
  if (module.kind === "resolved") {
    state.sources.add(module.value.declaration.getSourceFile());
    if (module.value.canonical.kind === "project") {
      next.push(module.value.canonical.declaration);
    }
  }
  for (const value of next.filter((candidate) => candidate !== node && !candidate.getSourceFile().isDeclarationFile())) {
    state.add(value);
  }
}
function captureOrdinaryCall(call: CallExpression, add: SourceClosure["add"]): NativeOrdinaryCall {
  const target = readCallTarget(call);
  const returns = readCallReturns(call);
  const owners = new Set<MorphNode>();
  if (target.kind === "resolved") {
    owners.add(target.value);
    add(target.value);
  }
  if (returns.kind === "resolved") {
    owners.add(returns.trace.origin);
    returns.value.forEach(add);
  }
  return {
    call,
    target,
    returns,
    calledMember: readCalledMember(call),
    memberOrigin: readCallMemberDeclarationOrigin(call).origin,
    selection: readDrizzleSelection(call) ?? null,
    bindings: [...owners].map((owner) => ({ owner, clears: callableParameters(owner), values: [...readCallBindings(call, owner, new Map())] })),
  };
}
function captureParameterUses(node: MorphNode, state: SourceClosure): void {
  if (!Node.isParameterDeclaration(node)) {
    return;
  }
  const owner = node.getParent();
  const body =
    Node.isFunctionDeclaration(owner) || Node.isArrowFunction(owner) || Node.isFunctionExpression(owner) || Node.isMethodDeclaration(owner)
      ? owner.getBody()
      : undefined;
  if (body !== undefined) {
    state.references.push({ node: node.getNameNode(), scope: body, uses: referencesOf(node.getNameNode(), body) });
  }
}
function closeSourceNodes(state: SourceClosure, owner: OrdinaryObservationOwner): void {
  for (const node of state.pending) {
    if (!observationNode(node)) {
      continue;
    }
    owner.related(node);
    state.sources.add(node.getSourceFile());
    closeBindings(node, state);
    if (Node.isElementAccessExpression(node)) {
      const key = node.getArgumentExpression();
      if (key !== undefined) {
        state.keys.add(key);
      }
    }
    const member = staticMemberAccess(node);
    if (member !== undefined) {
      state.add(member.receiver);
      addMember(state, member.receiver, member.name);
    }
    state.profile(node);
    if (Node.isCallExpression(node)) {
      state.calls.push(captureOrdinaryCall(node, state.add));
    }
    captureParameterUses(node, state);
  }
}
function captureMemberDeclarations(node: MorphNode, name: string, state: SourceClosure): NativeTypeProjection {
  const type = captureTypeProjection(node, { facets: ["member-declarations"], properties: [name] });
  for (const declarations of type["member-declarations"] ?? []) {
    for (const declaration of declarations.nonnullable ?? []) {
      const parent = declaration.getParent();
      if (Node.isInterfaceDeclaration(parent)) {
        state.profile(parent.getNameNode());
      }
    }
  }
  return type;
}
function captureOrdinaryNode(node: MorphNode, state: SourceClosure, query: SchemaQuery | undefined): NativeOrdinaryNode {
  return {
    node,
    type: captureTypeProjection(node, { facets: ["lexical", "type-identity"], properties: [] }),
    members: [...(state.members.get(node) ?? [])].map((name) => ({ name, type: captureMemberDeclarations(node, name, state) })),
    callable: resolveCallableOrigin(node),
    declaration: resolveCallableDeclaration(node),
    table: query === undefined ? null : mapSchemaKey(query.table(node)),
    column: query === undefined ? null : mapSchemaKey(query.column(node)),
    valueDeclaration: (Node.isIdentifier(node) ? lexicalReferenceSymbol(node)?.getValueDeclaration() : node.getSymbol()?.getValueDeclaration()) ?? null,
    rowIdentity: capturedRowIdentity(node),
    writer: readDrizzleWriterSource(node),
    roots: (["update", "insert"] as const).map((verb) => ({ verb, fact: readDrizzleWriteRoots(node, verb) })),
  };
}
function captureRowQuestions(demand: OrdinaryObservationDemand, state: SourceClosure, query: SchemaQuery | undefined): readonly NativeTypeSelector[] {
  const fact = query?.schema();
  if (fact?.status !== "ready" || query === undefined) {
    return [];
  }
  const services = nativeRowReadServices(rowModels(fact.value), query);
  const selectors: NativeTypeSelector[] = [];
  for (const read of demand.reads) {
    const parent = read.node.getParent();
    const candidate = columnReadAt(Node.isBindingElement(parent) ? parent : read.node);
    if (candidate === undefined) {
      continue;
    }
    selectors.push({
      base: { kind: "node", node: candidate.receiver },
      steps: [
        { kind: "nonnullable" },
        { kind: "property", name: candidate.column, at: candidate.receiver },
        { kind: "nonnullable" },
        { kind: "array-element-or-self" },
      ],
      displayAt: null,
    });
    readsSelectRowWith(candidate, {
      ...services,
      model: (node, path): boolean => {
        selectors.push({
          base: { kind: "node", node },
          steps: [...path.flatMap((name) => [{ kind: "nonnullable" as const }, { kind: "property" as const, name, at: node }]), { kind: "nonnullable" }],
          displayAt: null,
        });
        return services.model(node, path);
      },
      property: (node, name): ReturnType<typeof services.property> => {
        if (typeof name !== "string") {
          throw new Error("native ordinary row demand requires its exact scalar property");
        }
        addMember(state, node, name);
        return services.property(node, name);
      },
    });
  }
  return selectors;
}
function captureReadUses(demand: OrdinaryObservationDemand, state: SourceClosure): void {
  for (const read of demand.reads) {
    const scope =
      read.node.getFirstAncestor((ancestor) => Node.isFunctionLikeDeclaration(ancestor) || Node.isSourceFile(ancestor)) ?? read.node.getSourceFile();
    if (!state.references.some((entry) => entry.node === read.node && entry.scope === scope)) {
      state.references.push({ node: read.node, scope, uses: referencesOf(read.node, scope) });
    }
  }
}

/** Freeze original terminal membership before any returned-value query; omitted references remain omitted. */
export function captureOrdinaryObservations(demand: OrdinaryObservationDemand, owner: OrdinaryObservationOwner): NativeOrdinaryObservations {
  const { query, anchor } = owner;
  if (!Node.isSourceFile(anchor)) {
    throw new Error("native ordinary cohort requires its actual source anchor");
  }
  const fact = query?.schema();
  const schema = fact?.status === "ready" ? fact.value : undefined;
  const roots = ordinaryRoots(demand);
  const closureCalls = readCallClosure(roots);
  const first = roots[0] ?? demand.reads[0]?.node ?? anchor;
  const project = first.getProject();
  const capturedProgram = project.getProgram().compilerObject;
  const observations = observeCallReturns(roots);
  const initialCalls = observations.programs.flatMap((captured) => captured.calls.map(({ call }) => call));
  const terminals = initialCalls.filter((call) => matchesDeclaredCallTerminal(call, readCallMemberDeclarationOrigin(call).origin, demand.terminals));
  const terminalSet = new Set(terminals.map((call) => call.compilerNode));
  const returned = demand.reads.map((read) => ({ ...read, fact: readReturnedValue(read.node, read.path, observations, terminalSet) }));
  const state = sourceClosure(owner);
  seedSourceClosure(state, { demand, roots, closureCalls, initialCalls }, observations, schema);
  closeSourceNodes(state, owner);
  const extra = captureRowQuestions(demand, state, query);
  const nodes = [...state.pending].filter(observationNode).map((node) => captureOrdinaryNode(node, state, query));
  captureReadUses(demand, state);
  const selectors = ordinaryTypeSelectionPlan(
    nodes.map((value) => value.node),
    state.calls.map((value) => value.call),
    schema,
    extra,
  );
  const schemaProgram = schema?.tables[0]?.declaration.getProject().getProgram().compilerObject;
  return {
    anchor,
    schemaStatus: fact?.status ?? "unavailable",
    schemaReason: ordinarySchemaReason(fact),
    assertNode: (node): void => {
      const source = node.getSourceFile();
      if (
        node.wasForgotten() ||
        source.wasForgotten() ||
        node.getProject() !== project ||
        project.getProgram().compilerObject !== capturedProgram ||
        capturedProgram.getSourceFile(source.getFilePath()) !== source.compilerNode
      ) {
        throw new Error("native ordinary query belongs to a foreign or stale source/Program");
      }
    },
    demand,
    profileNodes: [...state.profileNodes],
    keys: [...state.keys],
    closureCalls,
    initialCalls,
    terminals,
    returned,
    nodes,
    calls: state.calls,
    references: state.references,
    exports: [...state.sources].map((source) => ({ source, names: [...source.getExportedDeclarations().keys()] })),
    types:
      selectors.selectors.length === 0
        ? null
        : captureTypeSelections(selectors, schema === undefined || schemaProgram === undefined ? undefined : { value: schema, program: schemaProgram }),
  };
}

function mapSchemaKey<Value extends { readonly identity: { readonly key: string } }>(fact: ReferenceFact<Value>): ReferenceFact<string> {
  return fact.kind === "unresolved" ? fact : { ...fact, value: fact.value.identity.key };
}

function ordinarySchemaReason(fact: ReturnType<SchemaQuery["schema"]> | undefined): string | null {
  if (fact === undefined) {
    return "complete schema roster is outside the captured importing world";
  }
  return fact.status === "ready" ? null : fact.reason;
}
