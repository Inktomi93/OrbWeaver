// One visitor-fed, invocation-local semantic fact for the bus policy family. No Project, second walk,
// path/name registry, cache, parser, exception table, or legacy gate adapter crosses this boundary.
import type { CallExpression, FunctionDeclaration, Node as MorphNode, SourceFile, TypeAliasDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { BusFact, BusFactQuery, BusUnresolvedIdentity } from "../contract/bus-fact.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import type { MutableBusRecord } from "./bus-fact-output.ts";
import { finishBusFact } from "./bus-fact-output.ts";
import {
  authoredProperty,
  BUS_UNION_SUFFIX,
  beltMembers,
  beltUnionNode,
  busAnchor,
  busDeclarationIdentity,
  busIdentityKey,
  busRefusal,
  callableDeclaration,
  callName,
  canonicalTypeAlias,
  discriminatorValues,
  EVENT_TYPES_SUFFIX,
  emitterSink,
  NAMED_BUS_UNIONS,
  operationIdentity,
  parameterProjection,
  typeDiscriminators,
  typeForParameter,
} from "./bus-fact-read.ts";
import { resolveCallableMember } from "./gate-contract-origin.ts";
import { readStaticAuthoredScalar } from "./static-authored-value.ts";

interface Relay {
  readonly declaration: FunctionDeclaration;
  readonly parameterIndex: number;
  readonly memberPath: readonly string[];
  readonly bus: MutableBusRecord;
}

interface QueryState {
  readonly aliases: TypeAliasDeclaration[];
  readonly belts: VariableDeclaration[];
  readonly serverCalls: CallExpression[];
  readonly emitterDoors: MorphNode[];
  readonly yields: import("ts-morph").YieldExpression[];
}

const CHAT_BUS = { path: "packages/contracts/src/chat/bus.ts", exportName: "ChatBusEvent" } as const;
const BUS_FACT_KEY = Object.freeze({ id: "bus-fact" });

function isProducerPath(record: MutableBusRecord, path: string): boolean {
  if (path.startsWith("packages/server/src/domain/") || path.startsWith("packages/server/src/transport/")) {
    return true;
  }
  return busIdentityKey(record.union) === busIdentityKey(CHAT_BUS) && path.startsWith("packages/server/src/entry/compose/");
}

function newState(): QueryState {
  return {
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

function collectNode(context: GatePolicyContext, state: QueryState, node: MorphNode, sourceFile: SourceFile): void {
  const path = context.relativePath(sourceFile);
  if (Node.isTypeAliasDeclaration(node) && node.isExported() && (node.getName().endsWith(BUS_UNION_SUFFIX) || NAMED_BUS_UNIONS.has(node.getName()))) {
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
  context: GatePolicyContext,
  buses: readonly MutableBusRecord[],
  byUnion: ReadonlyMap<string, MutableBusRecord>,
): (type: import("ts-morph").Type, at: MorphNode) => MutableBusRecord | undefined {
  const members = new Map(buses.map((record) => [record, new Set(record.declaredMembers.map(({ name }) => name))]));
  const deliveredFiles = new Set(context.files.map((sourceFile) => sourceFile.compilerNode));
  return (type, at) => {
    const alias = canonicalTypeAlias(type);
    if (alias !== undefined && deliveredFiles.has(alias.getSourceFile().compilerNode)) {
      const exact = byUnion.get(busIdentityKey(busDeclarationIdentity(context, alias)));
      if (exact?.belt !== null) {
        return exact;
      }
    }
    const values = typeDiscriminators(type, at);
    const candidates = buses.filter((record) => {
      const names = members.get(record);
      return record.belt !== null && names !== undefined && values.size > 0 && [...values].every((value) => names.has(value));
    });
    return candidates.length === 1 ? candidates[0] : undefined;
  };
}

function enclosingFunction(parameter: import("ts-morph").ParameterDeclaration): FunctionDeclaration | undefined {
  const parent = parameter.getParent();
  return Node.isFunctionDeclaration(parent) ? parent : undefined;
}

function addRelay(relays: Relay[], relay: Relay): boolean {
  if (
    relays.some(
      (candidate) =>
        candidate.declaration.compilerNode === relay.declaration.compilerNode &&
        candidate.parameterIndex === relay.parameterIndex &&
        candidate.memberPath.join(".") === relay.memberPath.join(".") &&
        candidate.bus === relay.bus,
    )
  ) {
    return false;
  }
  relays.push(relay);
  return true;
}

interface AppendEmissionInput {
  readonly context: GatePolicyContext;
  readonly record: MutableBusRecord;
  readonly call: CallExpression;
  readonly values: readonly { readonly value: string; readonly node: MorphNode }[];
  readonly unresolved: BusUnresolvedIdentity[];
}

function appendEmission({ context, record, call, values, unresolved }: AppendEmissionInput): void {
  const members = new Map(record.declaredMembers.map((member) => [member.name, member]));
  for (const value of values) {
    const member = members.get(value.value);
    if (member === undefined) {
      unresolved.push(
        busRefusal({
          context,
          stage: "emitter",
          reason: "missing",
          detail: `${record.union.exportName} emitter carries undeclared member ${value.value}`,
          node: value.node,
        }),
      );
      continue;
    }
    if (!record.emitters.some((emitter) => emitter.anchor.node.compilerNode === call.compilerNode && emitter.member.name === member.name)) {
      record.emitters.push({ member, operation: operationIdentity(context, call, record.union), anchor: busAnchor(context, call) });
    }
  }
}

function relayFromArgument(context: GatePolicyContext, argument: MorphNode, property: string, bus: MutableBusRecord): Relay | undefined {
  const projection = parameterProjection(context, argument, property, []);
  const declaration = projection === undefined ? undefined : enclosingFunction(projection.parameter);
  if (projection === undefined || declaration === undefined) {
    return;
  }
  const parameterIndex = declaration.getParameters().findIndex((parameter) => parameter.compilerNode === projection.parameter.compilerNode);
  return parameterIndex < 0 ? undefined : { declaration, parameterIndex, memberPath: projection.memberPath, bus };
}

interface DirectArgumentInput {
  readonly context: GatePolicyContext;
  readonly call: CallExpression;
  readonly index: number;
  readonly argument: MorphNode;
  readonly path: string;
  readonly parentFor: (type: import("ts-morph").Type, at: MorphNode) => MutableBusRecord | undefined;
  readonly unresolved: BusUnresolvedIdentity[];
  readonly relays: Relay[];
}

function collectDirectArgument({ context, call, index, argument, path, parentFor, unresolved, relays }: DirectArgumentInput): void {
  const type = typeForParameter(context, call, index);
  const record = type === undefined ? undefined : parentFor(type, call);
  if (record === undefined || !isProducerPath(record, path)) {
    return;
  }
  appendEmission({ context, record, call, values: discriminatorValues(context, argument, "type", []), unresolved });
  const relay = relayFromArgument(context, argument, "type", record);
  if (relay !== undefined) {
    addRelay(relays, relay);
  }
}

function emitterDoorNames(
  context: GatePolicyContext,
  declarations: readonly MorphNode[],
  parentFor: (type: import("ts-morph").Type, at: MorphNode) => MutableBusRecord | undefined,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const declaration of declarations) {
    if (!(Node.isParameterDeclaration(declaration) || Node.isPropertySignature(declaration) || Node.isMethodSignature(declaration))) {
      continue;
    }
    const ownsBusParameter = declaration
      .getType()
      .getNonNullableType()
      .getCallSignatures()
      .some((signature) =>
        signature
          .getParameters()
          .some((parameter) => parentFor(context.checker().getTypeOfSymbolAtLocation(parameter, declaration), declaration) !== undefined),
      );
    if (ownsBusParameter) {
      names.add(declaration.getName());
    }
  }
  return names;
}

function hasEmitterDoor(call: CallExpression, names: ReadonlySet<string>): boolean {
  if (call.getArguments().some((argument) => Node.isObjectLiteralExpression(argument) && argument.getProperty("type") !== undefined)) {
    return true;
  }
  const name = callName(call);
  if (name === "publish" || (name !== undefined && names.has(name))) {
    return true;
  }
  const expression = call.getExpression();
  const member = Node.isIdentifier(expression) ? resolveCallableMember(expression) : undefined;
  return member !== undefined && names.has(member.name);
}

interface DirectEmittersInput {
  readonly context: GatePolicyContext;
  readonly calls: readonly CallExpression[];
  readonly emitterNames: ReadonlySet<string>;
  readonly parentFor: (type: import("ts-morph").Type, at: MorphNode) => MutableBusRecord | undefined;
  readonly unresolved: BusUnresolvedIdentity[];
}

function directEmitters({ context, calls, emitterNames, parentFor, unresolved }: DirectEmittersInput): Relay[] {
  const relays: Relay[] = [];
  for (const call of calls) {
    const path = context.relativePath(call.getSourceFile());
    if (call.getArguments().length === 0 || !hasEmitterDoor(call, emitterNames) || emitterSink(context, call) === undefined) {
      continue;
    }
    for (const [index, argument] of call.getArguments().entries()) {
      collectDirectArgument({ context, call, index, argument, path, parentFor, unresolved, relays });
    }
  }
  return relays;
}

interface PropagateRelayInput {
  readonly context: GatePolicyContext;
  readonly call: CallExpression;
  readonly relay: Relay;
  readonly relays: Relay[];
  readonly unresolved: BusUnresolvedIdentity[];
  readonly visited: Set<string>;
}

function propagateRelay({ context, call, relay, relays, unresolved, visited }: PropagateRelayInput): boolean {
  const key = `${call.getSourceFile().getFilePath()}\0${call.getStart()}\0${relay.parameterIndex}\0${busIdentityKey(relay.bus.union)}`;
  if (visited.has(key)) {
    return false;
  }
  visited.add(key);
  const argument = call.getArguments()[relay.parameterIndex];
  if (argument === undefined) {
    unresolved.push(busRefusal({ context, stage: "emitter", reason: "missing", detail: "bus relay call omits its event argument", node: call }));
    return false;
  }
  const property = relay.memberPath[0] ?? "type";
  appendEmission({ context, record: relay.bus, call, values: discriminatorValues(context, argument, property, []), unresolved });
  const next = relayFromArgument(context, argument, property, relay.bus);
  return next !== undefined && addRelay(relays, next);
}

function callsByName(calls: readonly CallExpression[]): ReadonlyMap<string, readonly CallExpression[]> {
  const indexed = new Map<string, CallExpression[]>();
  for (const call of calls) {
    const name = callName(call);
    if (name !== undefined) {
      const existing = indexed.get(name);
      if (existing === undefined) {
        indexed.set(name, [call]);
      } else {
        existing.push(call);
      }
    }
  }
  return indexed;
}

function propagateRelayPass(
  input: Omit<PropagateRelayInput, "call" | "relay"> & { readonly callIndex: ReadonlyMap<string, readonly CallExpression[]> },
): boolean {
  let changed = false;
  for (const relay of [...input.relays]) {
    const name = relay.declaration.getName();
    for (const call of name === undefined ? [] : (input.callIndex.get(name) ?? [])) {
      if (callableDeclaration(call)?.compilerNode !== relay.declaration.compilerNode) {
        continue;
      }
      changed = propagateRelay({ ...input, call, relay }) || changed;
    }
  }
  return changed;
}

function propagateRelays(context: GatePolicyContext, calls: readonly CallExpression[], relays: Relay[], unresolved: BusUnresolvedIdentity[]): void {
  const visited = new Set<string>();
  const callIndex = callsByName(calls);
  while (propagateRelayPass({ context, callIndex, relays, unresolved, visited })) {
    // A newly discovered wrapper parameter may expose another caller on the next pass.
  }
}

interface YieldedValueInput {
  readonly context: GatePolicyContext;
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
  context: GatePolicyContext,
  statement: import("ts-morph").YieldExpression,
  record: MutableBusRecord,
  unresolved: BusUnresolvedIdentity[],
): void {
  if (!isProducerPath(record, context.relativePath(statement.getSourceFile()))) {
    return;
  }
  const expression = statement.getExpression();
  if (expression === undefined || !Node.isObjectLiteralExpression(expression)) {
    return;
  }
  const channel = authoredProperty(context, expression, "channel", unresolved);
  const channelValue = channel === undefined ? undefined : readStaticAuthoredScalar(channel);
  const event = authoredProperty(context, expression, "event", unresolved);
  if (channelValue?.kind !== "resolved" || channelValue.value !== "chat" || event === undefined) {
    return;
  }
  for (const value of discriminatorValues(context, event, "type", [])) {
    appendYieldedValue({ context, statement, record, value, unresolved });
  }
}

function attachYieldEmitters(
  context: GatePolicyContext,
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

function finishFact(context: GatePolicyContext, state: QueryState): BusFact {
  const unresolved: BusUnresolvedIdentity[] = [];
  const mutable: MutableBusRecord[] = state.aliases.map((alias) => ({
    union: { ...busDeclarationIdentity(context, alias), anchor: busAnchor(context, alias) },
    belt: null,
    declaredMembers: [],
    emitters: [],
  }));
  const byUnion = new Map(mutable.map((record) => [busIdentityKey(record.union), record]));
  for (const declaration of state.belts) {
    const unionNode = beltUnionNode(declaration);
    const alias = unionNode === undefined ? undefined : canonicalTypeAlias(unionNode.getType());
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

function createBusFactCollector(context: GatePolicyContext): BusFactQuery {
  const state = newState();
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
    hooks: {
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
    },
    finish: (): BusFact => {
      if (failure !== undefined) {
        throw failure;
      }
      finished ??= finishFact(context, state);
      return finished;
    },
  };
}

/** Share one collector across every selected bus policy in this pass; only the first registers visitors. */
export function createBusFactQuery<CoveredBus = never>(context: GatePolicyContext): BusFactQuery<CoveredBus> {
  const shared = context.sharedFact(BUS_FACT_KEY, () => createBusFactCollector(context));
  return shared.collect ? shared.value : { ...shared.value, hooks: {} };
}
