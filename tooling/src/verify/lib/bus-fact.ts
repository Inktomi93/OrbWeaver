// One visitor-fed, invocation-local semantic fact for the bus policy family. No Project, second walk,
// path/name registry, cache, parser, exception table, or legacy gate adapter crosses this boundary. The
// emitter-call resolution (direct arguments, relay discovery and propagation) is `bus-fact-emission.ts`,
// split out at the size cap 2026-09-18; the collector, the belt census, the yield-frame emitters and the
// finish stay here.
import type { CallExpression, Node as MorphNode, SourceFile, TypeAliasDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { BusFact, BusUnresolvedIdentity } from "../contract/bus-fact.ts";
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
import { readStaticAuthoredScalar } from "./static-authored-value.ts";

interface QueryState {
  readonly aliases: TypeAliasDeclaration[];
  readonly belts: VariableDeclaration[];
  readonly serverCalls: CallExpression[];
  readonly emitterDoors: MorphNode[];
  readonly yields: import("ts-morph").YieldExpression[];
}

/** The provider receipt states the denominator this collector actually MEASURED — the authored sources it
 *  walked — and nothing about what the census FOUND.
 *
 *  WHY NOT THE CENSUS COUNTS: it was `members: <declared members>` plus
 *  `unresolved: <unresolved identities>` until 2026-09-11, and `factReceiptFailures` (`lib/policy-pass.ts`)
 *  refuses any fact receipt with `members === 0` or `unresolved > 0` and withholds EVERY consumer before
 *  `evaluate`. Both of those numbers are this fact's own MODELLED VALUE (`BusFact.status` /
 *  `BusFact.unresolved`), and both already have designated fail-closed owners: `bus-fact-health`
 *  (hard/error, no waiver door) REPORTS every missing/empty/dynamic/ambiguous/unsupported identity — its
 *  header calls that "fail hard here" — and
 *  `recordReadyBusFact` throws for every ordinary consumer of a non-ready census. Filing them as receipt
 *  refusals made one cause produce both a violation and a "the checker is broken" verdict, and the tool
 *  error WON: `bus-fact-health` mustFlag[0] — the empty-corpus blind-instrument arm — could never reach
 *  `evaluate` (#1955). Same ruling as the schema fact family's, recorded at
 *  `docs/reviews/gate-runtime/schema-fact-family-1584.md`: a fail-closed finding does not also count
 *  `unresolved` in the receipt.
 *
 *  What the refusal still bites: a walked population of zero sources — the provider genuinely could not
 *  look, which no consumer can distinguish from a corpus that honestly holds no bus. */
const PROVIDER_RECEIPT_SOURCE = "bus-producer-sources";

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
