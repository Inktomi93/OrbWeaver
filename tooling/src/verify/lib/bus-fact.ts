// One visitor-fed, invocation-local semantic fact for the bus policy family. No Project, second walk,
// path/name registry, cache, parser, exception table, or legacy gate adapter crosses this boundary.
import type { CallExpression, FunctionDeclaration, Node as MorphNode, SourceFile, TypeAliasDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { BusCoveragePolicyIdentity, BusFact, BusFactQuery, BusUnresolvedIdentity } from "../contract/bus-fact.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import type { MutableBusRecord } from "./bus-fact-output.ts";
import { finishBusFact } from "./bus-fact-output.ts";
import {
  aliasForParameter,
  authoredProperty,
  BUS_UNION_SUFFIX,
  beltMembers,
  beltUnionNode,
  busAnchor,
  busDeclarationIdentity,
  busIdentityKey,
  busRefusal,
  callableDeclaration,
  canonicalTypeAlias,
  discriminatorValues,
  EVENT_TYPES_SUFFIX,
  indexedBusUnion,
  NAMED_BUS_UNIONS,
  operationIdentity,
  ownerIdentity,
  parameterProjection,
  typeDiscriminators,
} from "./bus-fact-read.ts";
import { isCanonicalDefineGate } from "./gate-contract-origin.ts";
import { readMemberReference } from "./reference-fact.ts";
import { resolveCallableOrigin } from "./reference-fact-call.ts";
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
  readonly calls: CallExpression[];
  readonly yields: import("ts-morph").YieldExpression[];
  readonly consumers: MorphNode[];
  readonly descriptorCalls: CallExpression[];
}

function newState(): QueryState {
  return { aliases: [], belts: [], calls: [], yields: [], consumers: [], descriptorCalls: [] };
}

function collectNode(context: GatePolicyContext, state: QueryState, node: MorphNode, sourceFile: SourceFile): void {
  const path = context.relativePath(sourceFile);
  if (Node.isTypeAliasDeclaration(node) && node.isExported() && (node.getName().endsWith(BUS_UNION_SUFFIX) || NAMED_BUS_UNIONS.has(node.getName()))) {
    state.aliases.push(node);
  }
  if (Node.isVariableDeclaration(node) && path.startsWith("packages/contracts/src/") && node.getName().endsWith(EVENT_TYPES_SUFFIX)) {
    state.belts.push(node);
  }
  if (Node.isCallExpression(node)) {
    state.calls.push(node);
    if (path.startsWith("tooling/src/verify/gates/") && isCanonicalDefineGate(node.getExpression())) {
      state.descriptorCalls.push(node);
    }
  }
  if (Node.isYieldExpression(node) && path.startsWith("packages/server/src/")) {
    state.yields.push(node);
  }
  if ((Node.isMappedTypeNode(node) || Node.isTypeReference(node)) && path.startsWith("packages/client/src/")) {
    state.consumers.push(node);
  }
}

function descriptorFields(context: GatePolicyContext, calls: readonly CallExpression[]): ReadonlyMap<string, BusCoveragePolicyIdentity> {
  const descriptors = new Map<string, BusCoveragePolicyIdentity>();
  for (const call of calls) {
    const argument = call.getArguments()[0];
    if (!Node.isObjectLiteralExpression(argument)) {
      continue;
    }
    const field = (name: string): string | undefined => {
      const property = argument.getProperty(name);
      const initializer = Node.isPropertyAssignment(property) ? property.getInitializer() : undefined;
      const read = initializer === undefined ? undefined : readStaticAuthoredScalar(initializer);
      return read?.kind === "resolved" && typeof read.value === "string" ? read.value : undefined;
    };
    const id = field("id");
    const family = field("family");
    const path = context.relativePath(call.getSourceFile());
    if (id !== undefined && family !== undefined && path === `tooling/src/verify/gates/${id}.ts`) {
      descriptors.set(path, { id, family, anchor: busAnchor(context, call) });
    }
  }
  return descriptors;
}

function isBusQuery(context: GatePolicyContext, call: CallExpression): boolean {
  const origin = resolveCallableOrigin(call);
  return (
    origin.kind === "resolved" &&
    origin.value.target.kind === "module" &&
    origin.value.target.canonical.kind === "project" &&
    context.relativePath(origin.value.target.canonical.sourceFile) === "tooling/src/verify/lib/bus-fact.ts" &&
    origin.value.target.canonical.exportedName === "createBusFactQuery"
  );
}

function attachCoveragePolicies(
  context: GatePolicyContext,
  state: QueryState,
  byUnion: ReadonlyMap<string, MutableBusRecord>,
  unresolved: BusUnresolvedIdentity[],
): void {
  const descriptors = descriptorFields(context, state.descriptorCalls);
  for (const call of state.calls) {
    if (!isBusQuery(context, call) || call.getTypeArguments().length === 0) {
      continue;
    }
    const typeNode = call.getTypeArguments()[0];
    const alias = typeNode === undefined ? undefined : canonicalTypeAlias(typeNode.getType());
    if (alias === undefined) {
      unresolved.push(
        busRefusal({ context, stage: "coverage-policy", reason: "missing", detail: "typed bus query does not resolve one bus union", node: call }),
      );
      continue;
    }
    const record = byUnion.get(busIdentityKey(busDeclarationIdentity(context, alias)));
    const descriptor = descriptors.get(context.relativePath(call.getSourceFile()));
    if (record === undefined || descriptor === undefined) {
      unresolved.push(
        busRefusal({
          context,
          stage: "coverage-policy",
          reason: "missing",
          detail: "typed bus query has no canonical bus record or policy descriptor",
          node: call,
        }),
      );
      continue;
    }
    if (record.coveragePolicy !== null && record.coveragePolicy.id !== descriptor.id) {
      unresolved.push(
        busRefusal({ context, stage: "coverage-policy", reason: "ambiguous", detail: `${record.union.exportName} has multiple coverage policies`, node: call }),
      );
      continue;
    }
    record.coveragePolicy = descriptor;
  }
}

function parentResolver(
  context: GatePolicyContext,
  buses: readonly MutableBusRecord[],
  byUnion: ReadonlyMap<string, MutableBusRecord>,
): (alias: TypeAliasDeclaration) => MutableBusRecord | undefined {
  const members = new Map(buses.map((record) => [record, new Set(record.declaredMembers.map(({ name }) => name))]));
  return (alias) => {
    const exact = byUnion.get(busIdentityKey(busDeclarationIdentity(context, alias)));
    if (exact?.belt !== null) {
      return exact;
    }
    const values = typeDiscriminators(alias);
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

function appendEmission(
  context: GatePolicyContext,
  record: MutableBusRecord,
  call: CallExpression,
  values: readonly { readonly value: string; readonly node: MorphNode }[],
  unresolved: BusUnresolvedIdentity[],
): void {
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

function directEmitters(
  context: GatePolicyContext,
  calls: readonly CallExpression[],
  parentFor: (alias: TypeAliasDeclaration) => MutableBusRecord | undefined,
  unresolved: BusUnresolvedIdentity[],
): Relay[] {
  const relays: Relay[] = [];
  for (const call of calls) {
    if (!context.relativePath(call.getSourceFile()).startsWith("packages/server/src/")) {
      continue;
    }
    for (const [index, argument] of call.getArguments().entries()) {
      const alias = aliasForParameter(context, call, index);
      const record = alias === undefined ? undefined : parentFor(alias);
      if (record === undefined) {
        continue;
      }
      appendEmission(context, record, call, discriminatorValues(context, argument, "type", unresolved), unresolved);
      const projection = parameterProjection(context, argument, "type", []);
      const fn = projection === undefined ? undefined : enclosingFunction(projection.parameter);
      if (projection !== undefined && fn !== undefined) {
        const parameterIndex = fn.getParameters().findIndex((parameter) => parameter.compilerNode === projection.parameter.compilerNode);
        if (parameterIndex >= 0) {
          addRelay(relays, { declaration: fn, parameterIndex, memberPath: projection.memberPath, bus: record });
        }
      }
    }
  }
  return relays;
}

function propagateRelays(context: GatePolicyContext, calls: readonly CallExpression[], relays: Relay[], unresolved: BusUnresolvedIdentity[]): void {
  const visited = new Set<string>();
  for (;;) {
    let changed = false;
    for (const call of calls) {
      const declaration = callableDeclaration(call);
      for (const relay of relays.filter((candidate) => candidate.declaration.compilerNode === declaration?.compilerNode)) {
        const key = `${call.getSourceFile().getFilePath()}\0${call.getStart()}\0${relay.parameterIndex}\0${busIdentityKey(relay.bus.union)}`;
        if (visited.has(key)) {
          continue;
        }
        visited.add(key);
        const argument = call.getArguments()[relay.parameterIndex];
        if (argument === undefined) {
          unresolved.push(busRefusal({ context, stage: "emitter", reason: "missing", detail: "bus relay call omits its event argument", node: call }));
          continue;
        }
        const property = relay.memberPath[0] ?? "type";
        appendEmission(context, relay.bus, call, discriminatorValues(context, argument, property, unresolved), unresolved);
        const projection = parameterProjection(context, argument, property, []);
        const fn = projection === undefined ? undefined : enclosingFunction(projection.parameter);
        if (projection !== undefined && fn !== undefined) {
          const parameterIndex = fn.getParameters().findIndex((parameter) => parameter.compilerNode === projection.parameter.compilerNode);
          changed = parameterIndex >= 0 && addRelay(relays, { declaration: fn, parameterIndex, memberPath: projection.memberPath, bus: relay.bus });
        }
      }
    }
    if (!changed) {
      return;
    }
  }
}

function attachClientConsumers(
  context: GatePolicyContext,
  nodes: readonly MorphNode[],
  parentFor: (alias: TypeAliasDeclaration) => MutableBusRecord | undefined,
): void {
  for (const node of nodes) {
    const indexed = Node.isMappedTypeNode(node)
      ? indexedBusUnion(node.getTypeParameter().getConstraint())
      : Node.isTypeReference(node) && node.getTypeName().getText() === "Record"
        ? indexedBusUnion(node.getTypeArguments()[0])
        : undefined;
    const alias = indexed === undefined ? undefined : canonicalTypeAlias(indexed.getType());
    const record = alias === undefined ? undefined : parentFor(alias);
    if (record !== undefined) {
      record.consumers.push({ bus: record.union, kind: "client-total-map", owner: ownerIdentity(context, node), anchor: busAnchor(context, node) });
    }
  }
}

function attachServerExhaustiveness(
  context: GatePolicyContext,
  calls: readonly CallExpression[],
  parentFor: (alias: TypeAliasDeclaration) => MutableBusRecord | undefined,
): void {
  for (const call of calls) {
    const argument = call.getArguments()[0];
    const signature = context.checker().getResolvedSignature(call);
    const parameter = signature?.getParameters()[0];
    const parameterType = parameter === undefined ? undefined : context.checker().getTypeOfSymbolAtLocation(parameter, call);
    const switchNode = call.getFirstAncestorByKind(SyntaxKind.SwitchStatement);
    if (argument === undefined || parameterType?.isNever() !== true || switchNode === undefined) {
      continue;
    }
    const discriminant = readMemberReference(switchNode.getExpression());
    if (discriminant.kind !== "resolved" || discriminant.value.name !== "type") {
      continue;
    }
    const alias = canonicalTypeAlias(discriminant.value.receiver.getType());
    const record = alias === undefined ? undefined : parentFor(alias);
    if (record !== undefined && argument.getText() === discriminant.value.receiver.getText()) {
      record.consumers.push({ bus: record.union, kind: "server-exhaustive", owner: ownerIdentity(context, call), anchor: busAnchor(context, call) });
    }
  }
}

function attachYieldEmitters(
  context: GatePolicyContext,
  yields: readonly import("ts-morph").YieldExpression[],
  buses: readonly MutableBusRecord[],
  unresolved: BusUnresolvedIdentity[],
): void {
  for (const statement of yields) {
    const expression = statement.getExpression();
    const typeAlias = expression === undefined ? undefined : canonicalTypeAlias(expression.getType());
    const record =
      typeAlias === undefined
        ? undefined
        : buses.find((candidate) => busIdentityKey(candidate.union) === busIdentityKey(busDeclarationIdentity(context, typeAlias)));
    if (expression === undefined || record === undefined || !Node.isObjectLiteralExpression(expression)) {
      continue;
    }
    const channel = authoredProperty(context, expression, "channel", unresolved);
    const channelValue = channel === undefined ? undefined : readStaticAuthoredScalar(channel);
    const event = authoredProperty(context, expression, "event", unresolved);
    if (channelValue?.kind !== "resolved" || channelValue.value !== "chat" || event === undefined) {
      continue;
    }
    const members = new Map(record.declaredMembers.map((member) => [member.name, member]));
    for (const value of discriminatorValues(context, event, "type", unresolved)) {
      const member = members.get(value.value);
      if (member !== undefined) {
        record.emitters.push({
          member,
          operation: { kind: "yield", owner: record.union, memberPath: ["chat", "event"] },
          anchor: busAnchor(context, statement),
        });
      }
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
    consumers: [],
    coveragePolicy: null,
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
  attachCoveragePolicies(context, state, byUnion, unresolved);
  const parentFor = parentResolver(context, mutable, byUnion);
  const relays = directEmitters(context, state.calls, parentFor, unresolved);
  propagateRelays(context, state.calls, relays, unresolved);
  attachClientConsumers(context, state.consumers, parentFor);
  attachServerExhaustiveness(context, state.calls, parentFor);
  attachYieldEmitters(context, state.yields, mutable, unresolved);
  if (mutable.length === 0) {
    unresolved.push(busRefusal({ context, stage: "union", reason: "missing", detail: "no exported bus union exists in the effective population" }));
  }
  return finishBusFact(mutable, unresolved);
}

/** Construct the bus query once inside a policy's `create`; the final dispatcher feeds its visitors. */
export function createBusFactQuery<CoveredBus = never>(context: GatePolicyContext): BusFactQuery<CoveredBus> {
  const state = newState();
  let finished: BusFact | undefined;
  return {
    visitors: [
      {
        kinds: [
          SyntaxKind.TypeAliasDeclaration,
          SyntaxKind.VariableDeclaration,
          SyntaxKind.CallExpression,
          SyntaxKind.YieldExpression,
          SyntaxKind.MappedType,
          SyntaxKind.TypeReference,
        ],
        visit: (node, sourceFile) => collectNode(context, state, node, sourceFile),
      },
    ],
    finish: (): BusFact => {
      finished ??= finishFact(context, state);
      return finished;
    },
  };
}
