// Ordinary graph encoding preserves canonical raw facts and source anchors; replay never runs a checker.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { DrizzleWriterMember, DrizzleWriterSource } from "./drizzle-writer-source-contract.ts";
import { encodeModuleOrigin, replayModuleOrigin } from "./module-origin-codec.ts";
import type { NativeOrdinaryObservations, OrdinaryObservationDemand } from "./ordinary-observations-contract.ts";
import type {
  InventoryOrdinaryMember,
  InventoryOrdinaryObservations,
  InventoryOrdinaryOrigin,
  WireWriter,
  WireWriterMember,
} from "./ordinary-observations-inventory.ts";
import { replayCallableDeclarationValue, replayReferenceFact, wireReferenceFact } from "./projection-reference-codec.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import { encodeTypeProjection, encodeTypeSelections, replayTypeProjection, replayTypeSelections } from "./type-projection-codec.ts";

export function mapOrdinaryDemand<From, To>(demand: OrdinaryObservationDemand<From>, map: (node: From) => To): OrdinaryObservationDemand<To> {
  return {
    roots: demand.roots.map(map),
    reads: demand.reads.map((read) => ({ node: map(read.node), path: [...read.path] })),
    terminals: { ...demand.terminals, packageMethods: [...demand.terminals.packageMethods], projectMethods: [...demand.terminals.projectMethods] },
  };
}

function encodeWriter(source: DrizzleWriterSource, span: (node: MorphNode) => InventorySpan): WireWriter {
  const member = (value: DrizzleWriterMember): WireWriterMember =>
    value.kind === "spread"
      ? { ...value, source: encodeWriter(value.source, span) }
      : { ...value, node: span(value.node), value: value.value === undefined ? null : span(value.value) };
  if (source.kind === "empty") {
    return { kind: source.kind, node: source.node === undefined ? null : span(source.node) };
  }
  const node = span(source.node);
  if (source.kind === "object") {
    return { ...source, node, members: source.members.map(member) };
  }
  if (source.kind === "choice") {
    return { ...source, node, values: source.values.map((value) => encodeWriter(value, span)) };
  }
  if (source.kind === "call") {
    return {
      ...source,
      node,
      owner: span(source.owner),
      returns: source.returns.map((value) => encodeWriter(value, span)),
      assignments: source.assignments.map(member),
    };
  }
  return { ...source, node };
}
function replayWriter(source: WireWriter, replay: (span: InventorySpan) => MorphNode): DrizzleWriterSource {
  const member = (value: WireWriterMember): DrizzleWriterMember =>
    value.kind === "spread"
      ? { ...value, source: replayWriter(value.source, replay) }
      : { ...value, node: replay(value.node), value: value.value === null ? undefined : replay(value.value) };
  if (source.kind === "empty") {
    return { kind: source.kind, node: source.node === null ? undefined : replay(source.node) };
  }
  const node = replay(source.node);
  if (source.kind === "object") {
    return { ...source, node, members: source.members.map(member) };
  }
  if (source.kind === "choice") {
    return { ...source, node, values: source.values.map((value) => replayWriter(value, replay)) };
  }
  if (source.kind === "call") {
    return {
      ...source,
      node: requireCall(node),
      owner: replay(source.owner),
      returns: source.returns.map((value) => replayWriter(value, replay)),
      assignments: source.assignments.map(member),
    };
  }
  return { ...source, node };
}
function requireCall(node: MorphNode): CallExpression {
  if (!Node.isCallExpression(node)) {
    throw new Error("native ordinary call span is foreign");
  }
  return node;
}

/** All nested alternatives, selected descriptors and supplied bindings survive serialization. */
export function encodeOrdinaryObservations(facts: NativeOrdinaryObservations, span: (node: MorphNode) => InventorySpan): InventoryOrdinaryObservations {
  const bindings = (values: ReadonlyMap<MorphNode, MorphNode>): [InventorySpan, InventorySpan][] => [...values].map(([key, value]) => [span(key), span(value)]);
  const member = (value: import("./drizzle-write-chain-contract.ts").CalledMember): InventoryOrdinaryMember => ({
    ...value,
    nameNode: span(value.nameNode),
    declarations: value.declarations.map(span),
  });
  const origin = (value: import("./reference-fact-contract.ts").ReferenceOrigin): InventoryOrdinaryOrigin =>
    value.kind === "module" ? encodeModuleOrigin(value, span) : { ...value, declarations: value.declarations.map(span) };
  return {
    anchor: span(facts.anchor),
    schemaStatus: facts.schemaStatus,
    schemaReason: facts.schemaReason,
    demand: mapOrdinaryDemand(facts.demand, span),
    profileNodes: facts.profileNodes.map(span),
    keys: facts.keys.map(span),
    closureCalls: facts.closureCalls.map(span),
    initialCalls: facts.initialCalls.map(span),
    terminals: facts.terminals.map(span),
    returned: facts.returned.map((read) => ({
      ...read,
      node: span(read.node),
      path: [...read.path],
      fact: wireReferenceFact(
        read.fact,
        (values) =>
          values.map((value) => ({
            present: value.present,
            value: span(value.value),
            path: [...value.path],
            bindings: bindings(value.bindings),
            ...(value.selectedDescriptors === undefined
              ? {}
              : {
                  selectedDescriptors: value.selectedDescriptors.map((descriptor) => ({
                    value: span(descriptor.value),
                    bindings: bindings(descriptor.bindings),
                  })),
                }),
            ...(value.nativeIteration === undefined
              ? {}
              : {
                  nativeIteration: {
                    call: span(value.nativeIteration.call),
                    collection: span(value.nativeIteration.collection),
                    parameter: span(value.nativeIteration.parameter),
                  },
                }),
            ...(value.nativeLookup === undefined ? {} : { nativeLookup: { call: span(value.nativeLookup.call), key: span(value.nativeLookup.key) } }),
          })),
        span,
      ),
    })),
    nodes: facts.nodes.map((value) => ({
      ...value,
      node: span(value.node),
      type: encodeTypeProjection(value.type, { facets: ["lexical", "type-identity"], properties: [] }, span),
      members: value.members.map((entry) => ({
        name: entry.name,
        type: encodeTypeProjection(entry.type, { facets: ["member-declarations"], properties: [entry.name] }, span),
      })),
      callable: wireReferenceFact(value.callable, (callable) => ({ ...callable, target: origin(callable.target), callee: span(callable.callee) }), span),
      declaration: wireReferenceFact(
        value.declaration,
        (declaration) => ({ declaration: span(declaration.declaration), body: declaration.body === undefined ? null : span(declaration.body) }),
        span,
      ),
      table: value.table === null ? null : wireReferenceFact(value.table, (key) => key, span),
      column: value.column === null ? null : wireReferenceFact(value.column, (key) => key, span),
      valueDeclaration: value.valueDeclaration === null ? null : span(value.valueDeclaration),
      rowIdentity:
        value.rowIdentity.kind === "refusal"
          ? value.rowIdentity
          : { ...value.rowIdentity, value: value.rowIdentity.value === null ? null : span(value.rowIdentity.value) },
      writer: encodeWriter(value.writer, span),
      roots: value.roots.map((entry) => ({
        ...entry,
        fact: wireReferenceFact(
          entry.fact,
          (roots) => roots.map((root) => ({ node: span(root.node), member: wireReferenceFact(root.member, member, span), table: span(root.table) })),
          span,
        ),
      })),
    })),
    calls: facts.calls.map((value) => ({
      ...value,
      call: span(value.call),
      target: wireReferenceFact(value.target, span, span),
      returns: wireReferenceFact(value.returns, (nodes) => nodes.map(span), span),
      calledMember: wireReferenceFact(value.calledMember, member, span),
      memberOrigin: wireReferenceFact(value.memberOrigin, (nodes) => nodes.map(span), span),
      selection:
        value.selection === null
          ? null
          : {
              ...value.selection,
              root: span(value.selection.root),
              source: value.selection.source === undefined ? null : span(value.selection.source),
              projection: value.selection.projection === undefined ? null : span(value.selection.projection),
              calls: value.selection.calls.map(span),
              sqlOperands: value.selection.sqlOperands.map(span),
            },
      bindings: value.bindings.map((entry) => ({
        owner: span(entry.owner),
        clears: entry.clears.map(span),
        values: entry.values.map(([key, node]): [InventorySpan, InventorySpan] => [span(key), span(node)]),
      })),
    })),
    references: facts.references.map((entry) => ({ node: span(entry.node), scope: span(entry.scope), uses: entry.uses.map(span) })),
    exports: facts.exports.map((entry) => ({ source: span(entry.source), names: [...entry.names] })),
    types: facts.types === null ? null : encodeTypeSelections(facts.types, span),
  };
}

/** Exact query identity is checked before canonical syntax replay, without reconstructing a Program. */
export function replayOrdinaryObservations(wire: InventoryOrdinaryObservations, replay: (span: InventorySpan) => MorphNode): NativeOrdinaryObservations {
  const call = (span: InventorySpan): CallExpression => requireCall(replay(span));
  const member = (value: InventoryOrdinaryMember): import("./drizzle-write-chain-contract.ts").CalledMember => ({
    ...value,
    nameNode: replay(value.nameNode),
    declarations: value.declarations.map(replay),
  });
  const origin = (value: import("./ordinary-observations-inventory.ts").InventoryOrdinaryOrigin): import("./reference-fact-contract.ts").ReferenceOrigin =>
    value.kind === "module" ? replayModuleOrigin(value, replay) : { ...value, declarations: value.declarations.map(replay) };
  const types = wire.types;
  const anchor = replay(wire.anchor);
  if (!Node.isSourceFile(anchor)) {
    throw new Error("native ordinary source anchor is foreign");
  }
  return {
    anchor,
    schemaStatus: wire.schemaStatus,
    schemaReason: wire.schemaReason,
    assertNode: (node): void => {
      const source = node.getSourceFile();
      const span = { file: source.getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
      if (replay(span) !== node) {
        throw new Error("native ordinary query belongs to a foreign source epoch");
      }
    },
    demand: mapOrdinaryDemand(wire.demand, replay),
    profileNodes: wire.profileNodes.map(replay),
    keys: wire.keys.map(replay),
    closureCalls: wire.closureCalls.map(call),
    initialCalls: wire.initialCalls.map(call),
    terminals: wire.terminals.map(call),
    returned: wire.returned.map((read) => ({
      node: replay(read.node),
      path: read.path,
      fact: replayReferenceFact(
        read.fact,
        (values) =>
          values.map((value) => ({
            present: value.present,
            path: value.path,
            value: replay(value.value),
            bindings: new Map(value.bindings.map(([key, node]) => [replay(key), replay(node)])),
            ...(value.selectedDescriptors === undefined
              ? {}
              : {
                  selectedDescriptors: value.selectedDescriptors.map((descriptor) => ({
                    value: replay(descriptor.value),
                    bindings: new Map(descriptor.bindings.map(([key, node]) => [replay(key), replay(node)])),
                  })),
                }),
            ...(value.nativeIteration === undefined
              ? {}
              : {
                  nativeIteration: {
                    call: call(value.nativeIteration.call),
                    collection: replay(value.nativeIteration.collection),
                    parameter: replay(value.nativeIteration.parameter),
                  },
                }),
            ...(value.nativeLookup === undefined ? {} : { nativeLookup: { call: call(value.nativeLookup.call), key: replay(value.nativeLookup.key) } }),
          })),
        replay,
      ),
    })),
    nodes: wire.nodes.map((value) => ({
      ...value,
      node: replay(value.node),
      type: replayTypeProjection(value.type, { facets: ["lexical", "type-identity"], properties: [] }, replay),
      members: value.members.map((entry) => ({
        name: entry.name,
        type: replayTypeProjection(entry.type, { facets: ["member-declarations"], properties: [entry.name] }, replay),
      })),
      callable: replayReferenceFact(value.callable, (callable) => ({ ...callable, target: origin(callable.target), callee: replay(callable.callee) }), replay),
      declaration: replayReferenceFact(value.declaration, (declaration) => replayCallableDeclarationValue(declaration, replay), replay),
      table: value.table === null ? null : replayReferenceFact(value.table, (key) => key, replay),
      column: value.column === null ? null : replayReferenceFact(value.column, (key) => key, replay),
      valueDeclaration: value.valueDeclaration === null ? null : replay(value.valueDeclaration),
      rowIdentity:
        value.rowIdentity.kind === "refusal"
          ? value.rowIdentity
          : { ...value.rowIdentity, value: value.rowIdentity.value === null ? null : replay(value.rowIdentity.value) },
      writer: replayWriter(value.writer, replay),
      roots: value.roots.map((entry) => ({
        ...entry,
        fact: replayReferenceFact(
          entry.fact,
          (roots) => roots.map((root) => ({ node: call(root.node), member: replayReferenceFact(root.member, member, replay), table: replay(root.table) })),
          replay,
        ),
      })),
    })),
    calls: wire.calls.map((value) => ({
      ...value,
      call: call(value.call),
      target: replayReferenceFact(value.target, replay, replay),
      returns: replayReferenceFact(value.returns, (nodes) => nodes.map(replay), replay),
      calledMember: replayReferenceFact(value.calledMember, member, replay),
      memberOrigin: replayReferenceFact(value.memberOrigin, (nodes) => nodes.map(replay), replay),
      selection:
        value.selection === null
          ? null
          : {
              ...value.selection,
              root: call(value.selection.root),
              source: value.selection.source === null ? undefined : replay(value.selection.source),
              projection: value.selection.projection === null ? undefined : replay(value.selection.projection),
              calls: value.selection.calls.map(call),
              sqlOperands: value.selection.sqlOperands.map(replay),
            },
      bindings: value.bindings.map((entry) => ({
        owner: replay(entry.owner),
        clears: entry.clears.map(replay),
        values: entry.values.map(([key, node]): readonly [MorphNode, MorphNode] => [replay(key), replay(node)]),
      })),
    })),
    references: wire.references.map((entry) => ({ node: replay(entry.node), scope: replay(entry.scope), uses: entry.uses.map(replay) })),
    exports: wire.exports.map((entry) => {
      const source = replay(entry.source);
      if (!Node.isSourceFile(source)) {
        throw new Error("native ordinary export source is foreign");
      }
      return { source, names: entry.names };
    }),
    types:
      types === null
        ? null
        : replayTypeSelections(
            types,
            {
              ...types.plan,
              selectors: types.plan.selectors.map((selector) => ({
                base: selector.base.kind === "schema-column" ? selector.base : { ...selector.base, node: replay(selector.base.node) },
                steps: selector.steps.map((step) => (step.kind === "property" ? { ...step, at: replay(step.at) } : step)),
                displayAt: selector.displayAt === null ? null : replay(selector.displayAt),
              })),
            },
            (node) => ({ file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
            replay,
          ),
  };
}
