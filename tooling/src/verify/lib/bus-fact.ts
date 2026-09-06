// One visitor-fed, invocation-local semantic fact for the bus policy family. No Project, second walk,
// path/name registry, cache, parser, exception table, or legacy gate adapter crosses this boundary.
import type { CallExpression, FunctionDeclaration, Node as MorphNode, SourceFile, TypeAliasDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { BusFact, BusUnresolvedIdentity } from "../contract/bus-fact.ts";
import type { GateFactContext, GateFactHooks } from "../contract/fact.ts";
import { defineFact } from "../contract/fact.ts";
import type { MutableBusRecord } from "./bus-fact-output.ts";
import { finishBusFact } from "./bus-fact-output.ts";
import type { ParameterProjection } from "./bus-fact-read.ts";
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
  discriminatorTranslation,
  discriminatorValues,
  EVENT_TYPES_SUFFIX,
  emitterSink,
  NAMED_BUS_UNIONS,
  operationIdentity,
  PUBLISH_MEMBER,
  parameterProjection,
  typeDiscriminators,
  typedDiscriminators,
  typeForParameter,
} from "./bus-fact-read.ts";
import { resolveCallableMember } from "./gate-contract-origin.ts";
import { readStaticAuthoredScalar } from "./static-authored-value.ts";

interface Relay {
  readonly declaration: FunctionDeclaration;
  readonly parameterIndex: number;
  readonly memberPath: readonly string[];
  readonly bus: MutableBusRecord;
  /** Present when the wrapper republishes a TRANSLATED form of the relayed member — the coarse per-user
   *  fan indexes a totality table with the relayed discriminator. The map is the table's own key→member
   *  translation, so the caller's proven members carry through it instead of the table being harvested. */
  readonly translate: ReadonlyMap<string, string> | null;
}

interface QueryState {
  readonly aliases: TypeAliasDeclaration[];
  readonly belts: VariableDeclaration[];
  readonly serverCalls: CallExpression[];
  readonly emitterDoors: MorphNode[];
  readonly yields: import("ts-morph").YieldExpression[];
}

const CHAT_BUS = { path: "packages/contracts/src/chat/bus.ts", exportName: "ChatBusEvent" } as const;

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

function collectNode(context: GateFactContext, state: QueryState, node: MorphNode, sourceFile: SourceFile): void {
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
  context: GateFactContext,
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

function translationKey(translate: ReadonlyMap<string, string> | null): string {
  return translate === null
    ? ""
    : [...translate]
        .map(([key, value]) => `${key}=${value}`)
        .toSorted((left, right) => left.localeCompare(right))
        .join(",");
}

function addRelay(relays: Relay[], relay: Relay): boolean {
  if (
    relays.some(
      (candidate) =>
        candidate.declaration.compilerNode === relay.declaration.compilerNode &&
        candidate.parameterIndex === relay.parameterIndex &&
        candidate.memberPath.join(".") === relay.memberPath.join(".") &&
        candidate.bus === relay.bus &&
        translationKey(candidate.translate) === translationKey(relay.translate),
    )
  ) {
    return false;
  }
  relays.push(relay);
  return true;
}

interface AppendEmissionInput {
  readonly context: GateFactContext;
  readonly record: MutableBusRecord;
  readonly call: CallExpression;
  readonly values: readonly { readonly value: string; readonly node: MorphNode }[];
  readonly unresolved: BusUnresolvedIdentity[];
  readonly translate?: ReadonlyMap<string, string> | null;
}

function appendEmission({ context, record, call, values, unresolved, translate = null }: AppendEmissionInput): void {
  const members = new Map(record.declaredMembers.map((member) => [member.name, member]));
  for (const raw of values) {
    const translated = translate === null ? raw.value : translate.get(raw.value);
    if (translated === undefined) {
      unresolved.push(
        busRefusal({
          context,
          stage: "emitter",
          reason: "missing",
          detail: `${record.union.exportName} republish table has no entry for relayed member ${raw.value}`,
          node: raw.node,
          expected: record.union,
        }),
      );
      continue;
    }
    const value = { value: translated, node: raw.node };
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

function relayOf(projection: ParameterProjection | undefined, bus: MutableBusRecord, translate: ReadonlyMap<string, string> | null): Relay | undefined {
  const declaration = projection === undefined ? undefined : enclosingFunction(projection.parameter);
  if (projection === undefined || declaration === undefined) {
    return;
  }
  const parameterIndex = declaration.getParameters().findIndex((parameter) => parameter.compilerNode === projection.parameter.compilerNode);
  return parameterIndex < 0 ? undefined : { declaration, parameterIndex, memberPath: projection.memberPath, bus, translate };
}

function relayFromArgument(context: GateFactContext, argument: MorphNode, property: string, bus: MutableBusRecord): Relay | undefined {
  return relayOf(parameterProjection(context, argument, property, []), bus, null);
}

/** `TABLE[<projection of a wrapper parameter>]` — the coarse republish. The argument's own flow type is the
 *  WHOLE table (every declared member), so harvesting it would mark every member produced; what is actually
 *  produced is the translated form of whatever the CALLER passed, which is a relay of that parameter. */
function republishRelayFromArgument(context: GateFactContext, argument: MorphNode, bus: MutableBusRecord): Relay | undefined {
  if (!Node.isElementAccessExpression(argument)) {
    return;
  }
  const key = argument.getArgumentExpression();
  const translate = key === undefined ? undefined : discriminatorTranslation(argument.getExpression());
  if (key === undefined || translate === undefined) {
    return;
  }
  return relayOf(parameterProjection(context, key, "type", []), bus, translate);
}

type ArgumentEmission =
  | { readonly kind: "values"; readonly values: readonly { readonly value: string; readonly node: MorphNode }[] }
  | { readonly kind: "relay"; readonly relay: Relay }
  /** A FORWARD: the argument carries the whole declared union, so it proves no member here. Whoever called
   *  the forwarder is where the members are provable, and that call is separately subject to this fact. */
  | { readonly kind: "forward" }
  | { readonly kind: "refused"; readonly refusals: readonly BusUnresolvedIdentity[] };

interface ArgumentEmissionInput {
  readonly context: GateFactContext;
  readonly argument: MorphNode;
  readonly property: string;
  readonly record: MutableBusRecord;
}

/** The ONE resolution ladder for an argument delivered to a proven emitter sink. Authored syntax first (it
 *  carries the exact source anchor), then the two relay shapes, then the checker's flow type. Only when
 *  every rung fails does the argument become an unresolved identity — and a flow type that is the whole
 *  declared union is a refusal too, never seventeen free emissions. */
function argumentEmission({ context, argument, property, record }: ArgumentEmissionInput): ArgumentEmission {
  const authoredRefusals: BusUnresolvedIdentity[] = [];
  const authored = discriminatorValues(context, argument, property, authoredRefusals);
  if (authored.length > 0) {
    return { kind: "values", values: authored };
  }
  const relay = relayFromArgument(context, argument, property, record) ?? republishRelayFromArgument(context, argument, record);
  if (relay !== undefined) {
    return { kind: "relay", relay };
  }
  // The flow read is the EXPENSIVE rung (a checker type per argument), so it runs only where the authored
  // reader actually REFUSED. An authored read that returns no values without refusing has already said the
  // argument is a projection the relay rungs above own; asking the checker again would re-derive the same
  // forward at full price. The narrowing is receipted by real-tree census equality, not by assertion.
  if (authoredRefusals.length === 0) {
    return { kind: "forward" };
  }
  const typed = typedDiscriminators(argument);
  if (typed.kind === "resolved") {
    const declared = new Set(record.declaredMembers.map(({ name }) => name));
    if (declared.size > 1 && typed.values.length === declared.size && typed.values.every((value) => declared.has(value))) {
      // THE TOTALITY TRIPWIRE. Harvesting this set would mark every member produced — the measured false
      // green the union's own header records for the coarse table, and the shape a subscriber forward
      // (`handler(entry.event)`) takes as well. It is a forward, not a defect: the fact stays READY
      // (the family's standing ruling that an unprovable emitter argument is an ordinary missing-emitter
      // finding, never a fact-health failure) and simply proves nothing here.
      return { kind: "forward" };
    }
    return { kind: "values", values: typed.values.map((value) => ({ value, node: argument })) };
  }
  if (authoredRefusals.length > 0) {
    return { kind: "refused", refusals: authoredRefusals };
  }
  return {
    kind: "refused",
    refusals: [busRefusal({ context, stage: "emitter", reason: typed.reason, detail: typed.detail, node: argument, expected: record.union })],
  };
}

interface DirectArgumentInput {
  readonly context: GateFactContext;
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
  const emission = argumentEmission({ context, argument, property: "type", record });
  if (emission.kind === "values") {
    appendEmission({ context, record, call, values: emission.values, unresolved });
  } else if (emission.kind === "relay") {
    addRelay(relays, emission.relay);
  } else if (emission.kind === "refused") {
    unresolved.push(...emission.refusals);
  }
}

function emitterDoorNames(
  context: GateFactContext,
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
  // The alias candidate is admitted on the MEMBER the binding holds, never on the local name it was given.
  return member !== undefined && (member.name === PUBLISH_MEMBER || names.has(member.name));
}

interface DirectEmittersInput {
  readonly context: GateFactContext;
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
  readonly context: GateFactContext;
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
  const emission = argumentEmission({ context, argument, property, record: relay.bus });
  if (emission.kind === "values") {
    // THE PRODUCER FENCE IS SYMMETRIC. A relayed call credits its member only where a DIRECT call would:
    // a wrapper reached from `entry/` is composition wiring, and "a compose-only publisher is wiring, not a
    // producer" is this family's own ruling (automation-bus-coverage mustFlag[1]). Crediting it through a
    // relay while refusing it directly would make the tier fence depend on how many hops the event took.
    // The relay itself still propagates: a domain/transport caller further out is a real producer.
    if (isProducerPath(relay.bus, context.relativePath(call.getSourceFile()))) {
      appendEmission({ context, record: relay.bus, call, values: emission.values, unresolved, translate: relay.translate });
    }
    return false;
  }
  if (emission.kind === "refused") {
    unresolved.push(...emission.refusals);
    return false;
  }
  if (emission.kind === "forward") {
    return false;
  }
  // A wrapper of a wrapper: the caller's own parameter carries the event one hop further out. A
  // translation composes onto the outer hop, so a coarse republish keeps translating what its callers pass.
  return addRelay(relays, { ...emission.relay, translate: emission.relay.translate ?? relay.translate });
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

function propagateRelays(context: GateFactContext, calls: readonly CallExpression[], relays: Relay[], unresolved: BusUnresolvedIdentity[]): void {
  const visited = new Set<string>();
  const callIndex = callsByName(calls);
  while (propagateRelayPass({ context, callIndex, relays, unresolved, visited })) {
    // A newly discovered wrapper parameter may expose another caller on the next pass.
  }
}

interface YieldedValueInput {
  readonly context: GateFactContext;
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
  context: GateFactContext,
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
  context: GateFactContext,
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

function finishFact(context: GateFactContext, state: QueryState): BusFact {
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

function createBusFactCollector(context: GateFactContext): GateFactHooks<BusFact> {
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
      context.receipt({ kind: "population", source: "bus-fact", members: finished.receipt.members, unresolved: finished.receipt.unresolved });
      return finished;
    },
  };
}

export const busProducerFact = defineFact({
  id: "bus-producers",
  population: { in: ["@contracts", "@server"], ext: ["ts", "tsx"] },
  analysis: "types",
  resources: [],
  create: createBusFactCollector,
});
