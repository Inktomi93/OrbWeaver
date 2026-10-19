// Sealed ordinary observations feed existing JSON judgments; missing evidence never falls back to syntax meaning.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { DrizzleOriginReaders } from "../../floor/code-facts/drizzle-origin-contract.ts";
import { isObservedModelType } from "../../floor/code-facts/drizzle-row.ts";
import type { RowReadServices } from "../../floor/code-facts/drizzle-row-contract.ts";
import { DrizzleRowOriginRefusal } from "../../floor/code-facts/drizzle-row-origin.ts";
import type { DrizzleRowModel } from "../../floor/code-facts/drizzle-vocabulary.ts";
import { DRIZZLE_INSERT_ROW_MODEL, DRIZZLE_SELECT_ROW_MODEL, DRIZZLE_UPDATE_VERB } from "../../floor/code-facts/drizzle-vocabulary.ts";
import { staticMemberAccess } from "../../floor/code-facts/reference-fact.ts";
import type { ReferenceFact } from "../../floor/code-facts/reference-fact-contract.ts";
import type { SchemaProjectedModel, SchemaProjectedTable } from "../../floor/code-facts/schema-projection-contract.ts";
import type { NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { matchesDeclaredCallTerminal } from "../../floor/code-facts/type-member-origin.ts";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { selectTypeSelections, typeProjectionFacet, typeSelectionIndex } from "../../floor/code-facts/type-projection-contract.ts";
import type { JsonColumnObservationReaders, JsonColumnReadReaders, JsonColumnSchemaReaders, JsonColumnWriterReaders } from "../contract/json-column-origin.ts";
import { JSON_COLUMN_READ_TERMINALS } from "./json-column-read.ts";

export function jsonColumnObservedReaders(evidence: NativeInvocationEvidence, schema: SchemaProjectedModel): JsonColumnObservationReaders {
  const graph = evidence.observations;
  if (graph === undefined) {
    throw new Error("native ordinary observations are unavailable");
  }
  const nodes = new Map(graph.nodes.map((value) => [value.node, value]));
  const calls = new Map(graph.calls.map((value) => [value.call, value]));
  if (nodes.size !== graph.nodes.length || calls.size !== graph.calls.length) {
    throw new Error("native ordinary graph identity is ambiguous");
  }
  const required = <Value>(values: ReadonlyMap<MorphNode, Value>, node: MorphNode): Value => {
    graph.assertNode(node);
    const value = values.get(node);
    if (value === undefined) {
      throw new Error("native ordinary query was not captured in this cohort");
    }
    return value;
  };
  const nodeOf = (node: MorphNode): import("../../floor/code-facts/ordinary-observations-contract.ts").NativeOrdinaryNode => required(nodes, node);
  const callOf = (call: CallExpression): import("../../floor/code-facts/ordinary-observations-contract.ts").NativeOrdinaryCall => required(calls, call);
  const member = (node: MorphNode): ReturnType<JsonColumnSchemaReaders["member"]> => staticMemberAccess(node, (key) => evidence.computedName(key));
  const schemaReaders: JsonColumnSchemaReaders = {
    member,
    module: (node) => required(evidence.modules, node),
    global: (node) => required(evidence.globals, node),
    stable: (node) => required(evidence.stableValues, node),
    string: (node) => required(evidence.strings, node),
    authored: (node) => required(evidence.authoredValues, node).value,
    composite: (node) => required(evidence.authoredValues, node).composite,
    callable: (node) => nodeOf(node).callable,
    declaration: (node) => nodeOf(node).declaration,
    lexical: (node) => typeProjectionFacet(nodeOf(node).type, "lexical"),
    propertyDeclarations: (node, name, nonnullable) => {
      const entry = nodeOf(node).members.find((candidate) => candidate.name === name);
      if (entry === undefined) {
        throw new Error("native ordinary member declaration demand is unavailable");
      }
      const declarations = typeProjectionFacet(entry.type, "member-declarations")[0];
      if (declarations === undefined) {
        throw new Error("native ordinary member declaration row is missing");
      }
      return (nonnullable ? declarations.nonnullable : declarations.raw) ?? [];
    },
  };
  const tableOf = (node: MorphNode): ReferenceFact<SchemaProjectedTable> => {
    const fact = nodeOf(node).table;
    if (fact === null) {
      throw new Error("native ordinary consumer has no complete schema view");
    }
    if (fact.kind === "unresolved") {
      return fact;
    }
    const table = schema.tables.find((candidate) => candidate.identity.key === fact.value);
    if (table === undefined) {
      throw new Error("native ordinary table identity is foreign to the complete catalog");
    }
    return { ...fact, value: table };
  };
  const originReaders: DrizzleOriginReaders = {
    module: schemaReaders.module,
    stable: schemaReaders.stable,
    member,
    valueDeclaration: (node) => nodeOf(node).valueDeclaration ?? undefined,
    declarations: (node) => schemaReaders.lexical(node).declarations ?? [],
    calledMember: (call) => callOf(call).calledMember,
    selection: (node) => {
      if (!Node.isCallExpression(node)) {
        throw new Error("native ordinary select demand is not a call");
      }
      return callOf(node).selection ?? undefined;
    },
    rowIdentity: (node) => {
      const fact = nodeOf(node).rowIdentity;
      if (fact.kind === "refusal") {
        throw new DrizzleRowOriginRefusal(fact.message);
      }
      return fact.value ?? undefined;
    },
    returns: (call) => callOf(call).returns,
    bindings: (call, owner, previous) => {
      const fact = callOf(call).bindings.find((entry) => entry.owner === owner);
      if (fact === undefined) {
        throw new Error("native ordinary formal binding demand is unavailable");
      }
      const next = new Map(previous);
      for (const formal of fact.clears) {
        next.delete(formal);
      }
      for (const [formal, value] of fact.values) {
        next.set(formal, value);
      }
      return next;
    },
  };
  const typeFacts = (): import("../../floor/code-facts/type-projection-contract.ts").NativeTypeSelections => {
    graph.assertNode(graph.anchor);
    if (graph.types === null) {
      throw new Error("native ordinary Type selection cohort is unavailable");
    }
    return graph.types;
  };
  const selected = (selector: NativeTypeSelector): import("../../floor/code-facts/type-projection-contract.ts").NativeSelectedType | null => {
    if (selector.base.kind === "schema-column" && graph.schemaStatus !== "ready") {
      throw new Error("native ordinary complete schema view is unavailable: " + graph.schemaReason);
    }
    if (selector.base.kind !== "schema-column") {
      graph.assertNode(selector.base.node);
    }
    for (const step of selector.steps) {
      if (step.kind === "property") {
        graph.assertNode(step.at);
      }
    }
    const facts = typeFacts();
    const value = facts.values[typeSelectionIndex(facts, selector)];
    if (value === undefined) {
      throw new Error("native ordinary Type selection answer is missing");
    }
    return value;
  };
  const modelIds = (name: DrizzleRowModel): ReadonlySet<number> =>
    new Set(
      schema.tables.flatMap((table) => {
        const type = selected({ base: { kind: "node", node: table.declaration }, steps: [{ kind: "property", name, at: table.declaration }], displayAt: null });
        return type === null ? [] : [type.identity];
      }),
    );
  const selectModels = (): ReadonlySet<number> => modelIds(DRIZZLE_SELECT_ROW_MODEL);
  const insertModels = (): ReadonlySet<number> => modelIds(DRIZZLE_INSERT_ROW_MODEL);
  const rowReaders: RowReadServices = {
    model: (node, path) =>
      isObservedModelType(
        selected({
          base: { kind: "node", node },
          steps: [...path.flatMap((name) => [{ kind: "nonnullable" as const }, { kind: "property" as const, name, at: node }]), { kind: "nonnullable" }],
          displayAt: null,
        }),
        selectModels(),
      ),
    exactModel: (node) => {
      const type = selected({ base: { kind: "node", node }, steps: [], displayAt: null });
      return type !== null && selectModels().has(type.identity);
    },
    identity: (node) => typeProjectionFacet(nodeOf(node).type, "type-identity"),
    property: (node, name) => {
      if (typeof name !== "string") {
        throw new Error("native ordinary row demand has a foreign property path");
      }
      const entry = nodeOf(node).members.find((candidate) => candidate.name === name);
      if (entry === undefined) {
        throw new Error("native ordinary row property origin is unavailable");
      }
      const fact = typeProjectionFacet(entry.type, "member-declarations")[0];
      if (fact === undefined) {
        throw new Error("native ordinary row property origin row is missing");
      }
      return fact.origin;
    },
    lexical: (node) => schemaReaders.lexical(node).value,
    target: (call) => callOf(call).target,
    columnDeclaration: (node) => {
      graph.assertNode(node);
      return schema.tables.some((table) => table.columns.some((column) => column.declaration === node));
    },
    columnReference: (node) => {
      const fact = nodeOf(node).column;
      if (fact === null) {
        throw new Error("native ordinary consumer has no complete column view");
      }
      return fact.kind === "resolved";
    },
  };
  const initial = new Set(graph.initialCalls);
  if (
    graph.terminals.some((call) => !initial.has(call)) ||
    graph.demand.roots.some((call) => !(Node.isCallExpression(call) && initial.has(call))) ||
    new Set(graph.terminals).size !== graph.terminals.length ||
    new Set(graph.initialCalls).size !== graph.initialCalls.length
  ) {
    throw new Error("native ordinary root or terminal membership is incomplete or foreign");
  }
  const expected = graph.initialCalls.filter((call) => matchesDeclaredCallTerminal(call, callOf(call).memberOrigin, graph.demand.terminals));
  if (expected.length !== graph.terminals.length || expected.some((call, index) => call !== graph.terminals[index])) {
    throw new Error("native ordinary frozen terminal membership is incomplete or foreign");
  }
  const readReaders: JsonColumnReadReaders = {
    parse: (call) => matchesDeclaredCallTerminal(call, callOf(call).memberOrigin, graph.demand.terminals),
    target: rowReaders.target,
    references: (node, scope) => {
      graph.assertNode(node);
      graph.assertNode(scope);
      const fact = graph.references.find((entry) => entry.node === node && entry.scope === scope);
      if (fact === undefined) {
        throw new Error("native ordinary lexical-use demand is unavailable");
      }
      return fact.uses;
    },
    writeColumn: (site, column) => {
      const call = site.getFirstAncestorByKind(SyntaxKind.CallExpression);
      const write = call === undefined ? undefined : required(evidence.drizzleWrites, call);
      if (write === undefined) {
        return false;
      }
      if (write.kind === "unresolved") {
        return false;
      }
      if (write.value === null || write.value.arg !== site) {
        return false;
      }
      const target = tableOf(write.value.target);
      return target.kind === "resolved" && target.value.columns.some((candidate) => candidate.identity.propertyName === column);
    },
    insertModel: (literal) =>
      isObservedModelType(selected({ base: { kind: "contextual", node: literal }, steps: [{ kind: "nonnullable" }], displayAt: null }), insertModels()),
  };
  const writerReaders: JsonColumnWriterReaders = {
    member,
    table: tableOf,
    roots: (node, verb) => {
      const entry = nodeOf(node).roots.find((candidate) => candidate.verb === (verb ?? DRIZZLE_UPDATE_VERB));
      if (entry === undefined) {
        throw new Error("native ordinary write-root demand is unavailable");
      }
      return entry.fact;
    },
    source: (node) => (node === undefined ? { kind: "empty", node } : nodeOf(node).writer),
  };
  return {
    graph,
    schemaReaders,
    originReaders,
    rowReaders,
    readReaders,
    writerReaders,
    selected,
    typeSelections: (plan: import("../../floor/code-facts/type-projection-contract.ts").NativeTypeSelectionPlan) => selectTypeSelections(typeFacts(), plan),
    returned: (node: MorphNode, path: readonly string[]): ReturnType<JsonColumnObservationReaders["returned"]> => {
      graph.assertNode(node);
      const matches = graph.returned.filter(
        (read) => read.node === node && read.path.length === path.length && read.path.every((part, index) => part === path[index]),
      );
      if (matches.length !== 1 || matches[0] === undefined) {
        throw new Error("native ordinary returned query/path was not registered");
      }
      return matches[0].fact;
    },
    exports: (source: import("ts-morph").SourceFile): readonly string[] => {
      graph.assertNode(source);
      const fact = graph.exports.find((entry) => entry.source === source);
      if (fact === undefined) {
        throw new Error("native ordinary export-name observation is unavailable");
      }
      return fact.names;
    },
  };
}

/** Root/read ordering is authored registration data, not a sorted or unioned cache key. */
export function jsonColumnObservationPlan(
  roots: readonly CallExpression[],
  reads: readonly { readonly node: MorphNode; readonly path: readonly string[] }[],
): import("../../floor/code-facts/semantic-inventory-contract.ts").InventoryInvocationPlan {
  const span = (node: MorphNode): import("../../floor/code-facts/semantic-inventory-contract.ts").InventorySpan => ({
    file: node.getSourceFile().getFilePath().replaceAll("\\", "/"),
    start: node.getStart(),
    end: node.getEnd(),
    kind: node.getKind(),
  });
  return {
    mode: "observations",
    facets: [],
    arguments: [],
    observations: {
      roots: roots.map(span),
      reads: reads.map((read) => ({ node: span(read.node), path: [...read.path] })),
      terminals: {
        ...JSON_COLUMN_READ_TERMINALS,
        packageMethods: [...JSON_COLUMN_READ_TERMINALS.packageMethods],
        projectMethods: [...JSON_COLUMN_READ_TERMINALS.projectMethods],
      },
    },
  };
}

/** Multiple authored files in one importing world share the same delivered graph and local lookup maps. */
export function jsonColumnObservedCohort(
  evidence: ReadonlyMap<MorphNode, NativeInvocationEvidence>,
  schema: SchemaProjectedModel,
): ReadonlyMap<import("ts-morph").SourceFile, ReturnType<typeof jsonColumnObservedReaders>> {
  const graphs = new Map<NativeInvocationEvidence, ReturnType<typeof jsonColumnObservedReaders>>();
  const sources = new Map<import("ts-morph").SourceFile, ReturnType<typeof jsonColumnObservedReaders>>();
  for (const [source, facts] of evidence) {
    if (!Node.isSourceFile(source)) {
      throw new Error("native ordinary cohort has a foreign source anchor");
    }
    let value = graphs.get(facts);
    if (value === undefined) {
      value = jsonColumnObservedReaders(facts, schema);
      graphs.set(facts, value);
    }
    sources.set(source, value);
  }
  return sources;
}
