// One visitor-fed, invocation-local semantic fact for the bus policy family. No Project, second walk,
// path/name registry, cache, parser, exception table, or legacy gate adapter crosses this boundary. The
// emitter-call resolution (direct arguments, relay discovery and propagation) is `bus-fact-emission.ts`,
// split out at the size cap 2026-09-18; the collector, the belt census, the yield-frame emitters and the
// finish stay here.
import type { CallExpression, Node as MorphNode, SourceFile, TypeAliasDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type { BusFact, BusReadContext, BusUnresolvedIdentity } from "../contract/bus-fact.ts";
import type { GateFactContext, GateFactHooks } from "../contract/fact.ts";
import { defineFact } from "../contract/fact.ts";
import { CHAT_BUS, directEmitters, emitterDoorNames, isProducerPath, propagateRelays } from "./bus-fact-emission.ts";
import type { MutableBusRecord } from "./bus-fact-output.ts";
import { finishBusFact } from "./bus-fact-output.ts";
import {
  authoredProperty,
  BUS_UNION_SUFFIX,
  beltMembers,
  beltUnionNode,
  busAliasExported,
  busAnchor,
  busDeclarationIdentity,
  busIdentityKey,
  busRefusal,
  canonicalTypeAlias,
  discriminatorValues,
  EVENT_TYPES_SUFFIX,
  NAMED_BUS_UNIONS,
  typeDiscriminators,
} from "./bus-fact-read.ts";
import { busNativeRead, busReadAt, busScalar } from "./bus-native-read.ts";

interface QueryState {
  readonly bindings: VariableDeclaration[];
  readonly aliases: TypeAliasDeclaration[];
  readonly belts: VariableDeclaration[];
  readonly serverCalls: CallExpression[];
  readonly emitterDoors: MorphNode[];
  readonly yields: import("ts-morph").YieldExpression[];
}

// Source coverage is the provider denominator; census completeness belongs to recordReadyBusFact.
const PROVIDER_RECEIPT_SOURCE = "bus-producer-sources";

function newState(): QueryState {
  return {
    bindings: [],
    aliases: [],
    belts: [],
    serverCalls: [],
    emitterDoors: [],
    yields: [],
  };
}

function collectCall(state: QueryState, call: CallExpression, path: string): void {
  if (path.startsWith("packages/server/src/")) {
    state.serverCalls.push(call);
  }
}

function collectNode(context: BusReadContext, state: QueryState, node: MorphNode, sourceFile: SourceFile): void {
  const path = context.relativePath(sourceFile);
  if (Node.isVariableDeclaration(node)) {
    state.bindings.push(node);
  }
  if (Node.isTypeAliasDeclaration(node) && (node.getName().endsWith(BUS_UNION_SUFFIX) || NAMED_BUS_UNIONS.has(node.getName()))) {
    state.aliases.push(node);
  }
  if (
    Node.isVariableDeclaration(node) &&
    path.startsWith("packages/contracts/src/") &&
    node.getName().endsWith(EVENT_TYPES_SUFFIX) &&
    beltUnionNode(node) !== undefined
  ) {
    state.belts.push(node);
  }
  if (Node.isCallExpression(node)) {
    collectCall(state, node, path);
  }
  if (
    path.startsWith("packages/server/src/") &&
    (Node.isParameterDeclaration(node) || Node.isPropertySignature(node) || Node.isMethodSignature(node)) &&
    (node.getText().includes("Event") || node.getText().includes("Emitter"))
  ) {
    state.emitterDoors.push(node);
  }
  if (Node.isYieldExpression(node) && path.startsWith("packages/server/src/")) {
    state.yields.push(node);
  }
}

function parentResolver(
  context: BusReadContext,
  buses: readonly MutableBusRecord[],
  byUnion: ReadonlyMap<string, MutableBusRecord>,
): (type: import("../../floor/code-facts/type-projection-contract.ts").NativeTypeSelector, at: MorphNode) => MutableBusRecord | undefined {
  const members = new Map(buses.map((record) => [record, new Set(record.declaredMembers.map(({ name }) => name))]));
  const deliveredFiles = new Set(context.files.map((sourceFile) => sourceFile.getFilePath()));
  return (type, at) => {
    const alias = canonicalTypeAlias(context, type, at);
    if (alias !== undefined && deliveredFiles.has(alias.getSourceFile().getFilePath())) {
      const exact = byUnion.get(busIdentityKey(busDeclarationIdentity(context, alias)));
      if (exact?.belt !== null) {
        return exact;
      }
    }
    const values = typeDiscriminators(context, type, at);
    const candidates = buses.filter((record) => {
      const names = members.get(record);
      return record.belt !== null && names !== undefined && values.size > 0 && [...values].every((value) => names.has(value));
    });
    return candidates.length === 1 ? candidates[0] : undefined;
  };
}

interface YieldedValueInput {
  readonly context: BusReadContext;
  readonly statement: import("ts-morph").YieldExpression;
  readonly record: MutableBusRecord;
  readonly value: { readonly value: string; readonly node: MorphNode };
  readonly unresolved: BusUnresolvedIdentity[];
}

function appendYieldedValue({ context, statement, record, value, unresolved }: YieldedValueInput): void {
  const member = record.declaredMembers.find((candidate) => candidate.name === value.value);
  if (member === undefined) {
    unresolved.push(
      busRefusal({
        context,
        stage: "emitter",
        reason: "missing",
        detail: `${record.union.exportName} yielded frame carries undeclared member ${value.value}`,
        node: value.node,
        expected: record.union,
      }),
    );
    return;
  }
  if (!record.emitters.some((emitter) => emitter.anchor.node.compilerNode === statement.compilerNode && emitter.member.name === member.name)) {
    record.emitters.push({
      member,
      operation: { kind: "yield", owner: record.union, memberPath: ["chat", "event"] },
      anchor: busAnchor(context, statement),
    });
  }
}

function attachYieldEmitter(
  inputContext: BusReadContext,
  statement: import("ts-morph").YieldExpression,
  record: MutableBusRecord,
  unresolved: BusUnresolvedIdentity[],
): void {
  const context = busReadAt(inputContext, statement);
  if (!isProducerPath(record, context.relativePath(statement.getSourceFile()))) {
    return;
  }
  const expression = statement.getExpression();
  if (expression === undefined || !Node.isObjectLiteralExpression(expression)) {
    return;
  }
  const channel = authoredProperty(context, expression, "channel", unresolved);
  const channelValue = channel === undefined ? undefined : busScalar(context, channel);
  const event = authoredProperty(context, expression, "event", unresolved);
  if (channelValue?.kind !== "resolved" || channelValue.value !== "chat" || event === undefined) {
    return;
  }
  for (const value of discriminatorValues(context, event, "type", [])) {
    appendYieldedValue({ context, statement, record, value, unresolved });
  }
}

function attachYieldEmitters(
  context: BusReadContext,
  yields: readonly import("ts-morph").YieldExpression[],
  byUnion: ReadonlyMap<string, MutableBusRecord>,
  unresolved: BusUnresolvedIdentity[],
): void {
  const record = byUnion.get(busIdentityKey(CHAT_BUS));
  if (record !== undefined) {
    for (const statement of yields) {
      attachYieldEmitter(context, statement, record, unresolved);
    }
  }
}

function finishFact(context: BusReadContext, state: QueryState): BusFact {
  const unresolved: BusUnresolvedIdentity[] = [];
  const mutable: MutableBusRecord[] = state.aliases
    .filter((alias) => busAliasExported(context, alias))
    .map((alias) => ({
      union: { ...busDeclarationIdentity(context, alias), anchor: busAnchor(context, alias) },
      belt: null,
      declaredMembers: [],
      emitters: [],
    }));
  const byUnion = new Map(mutable.map((record) => [busIdentityKey(record.union), record]));
  for (const declaration of state.belts) {
    const unionNode = beltUnionNode(declaration);
    const alias = unionNode === undefined ? undefined : canonicalTypeAlias(context, nodeTypeSelector(unionNode), unionNode);
    const record = alias === undefined ? undefined : byUnion.get(busIdentityKey(busDeclarationIdentity(context, alias)));
    if (unionNode === undefined || alias === undefined || record === undefined) {
      unresolved.push(
        busRefusal({
          context,
          stage: "belt",
          reason: unionNode === undefined ? "unsupported" : "missing",
          detail: `${declaration.getName()} does not resolve one discovered Union["type"] belt`,
          node: declaration,
        }),
      );
      continue;
    }
    if (record.belt !== null) {
      unresolved.push(
        busRefusal({ context, stage: "belt", reason: "ambiguous", detail: `${record.union.exportName} has more than one event belt`, node: declaration }),
      );
      continue;
    }
    record.belt = {
      path: context.relativePath(declaration.getSourceFile()),
      exportName: declaration.getName(),
      union: record.union,
      anchor: busAnchor(context, declaration),
    };
    record.declaredMembers.push(...beltMembers(context, declaration, record.union, unresolved));
  }
  const parentFor = parentResolver(context, mutable, byUnion);
  const names = emitterDoorNames(context, state.emitterDoors, parentFor);
  const relays = directEmitters({ context, calls: state.serverCalls, emitterNames: names, parentFor, unresolved });
  propagateRelays(context, state.serverCalls, relays, unresolved);
  attachYieldEmitters(context, state.yields, byUnion, unresolved);
  if (mutable.length === 0) {
    unresolved.push(busRefusal({ context, stage: "union", reason: "missing", detail: "no exported bus union exists in the effective population" }));
  }
  return finishBusFact(mutable, unresolved);
}

function createBusFactCollector(input: GateFactContext): GateFactHooks<BusFact> {
  const state = newState();
  const native = busNativeRead(
    input,
    () => [...state.bindings, ...state.aliases, ...state.belts, ...state.serverCalls, ...state.emitterDoors, ...state.yields],
    "producer",
  );
  const context = native.context;
  let finished: BusFact | undefined;
  let failure: unknown;
  const visit = (node: MorphNode, sourceFile: SourceFile): void => {
    try {
      collectNode(context, state, node, sourceFile);
    } catch (error) {
      failure ??= error;
      throw error;
    }
  };
  return {
    prepare: native.prepare,
    visitors: [
      {
        kinds: [
          SyntaxKind.TypeAliasDeclaration,
          SyntaxKind.VariableDeclaration,
          SyntaxKind.CallExpression,
          SyntaxKind.Parameter,
          SyntaxKind.PropertySignature,
          SyntaxKind.MethodSignature,
          SyntaxKind.YieldExpression,
        ],
        visit,
      },
    ],
    finish: (): BusFact => {
      if (failure !== undefined) {
        throw failure;
      }
      finished ??= finishFact(context, state);
      context.receipt({ kind: "population", source: PROVIDER_RECEIPT_SOURCE, members: context.files.length });
      return finished;
    },
  };
}

export const busProducerFact = defineFact({
  id: "bus-producers",
  population: { in: ["@contracts", "@server"] },
  analysis: "types",
  resources: [],
  create: createBusFactCollector,
});
