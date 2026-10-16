// Replay one captured invocation graph into canonical syntax nodes; the inventory retains ownership.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { NativeAuthoredValueProjection } from "./authored-value-projection.ts";
import { replayAuthoredValueProjection } from "./authored-value-projection-codec.ts";
import type { IndexedCallParameters } from "./drizzle-column-read-contract.ts";
import type { DrizzleWrite } from "./drizzle-columns.ts";
import { replayDrizzleValueSourceEvidence } from "./drizzle-evidence-replay.ts";
import type { DrizzleValueSourceEvidence } from "./drizzle-query-contract.ts";
import { replayModuleOrigin } from "./module-origin-codec.ts";
import { replayOrdinaryObservations } from "./ordinary-observations-codec.ts";
import type { NativeOrdinaryObservations } from "./ordinary-observations-contract.ts";
import { replayReferenceFact } from "./projection-reference-codec.ts";
import type { CallableBinding, CallableInvocation, ModuleMemberOrigin, ReferenceFact, ReferenceOrigin } from "./reference-fact-contract.ts";
import type {
  InventoryInvocationEvidence,
  InventoryInvocationPlan,
  InventoryInvocationReference,
  InventorySpan,
  NativeInvocationEvidence,
} from "./semantic-inventory-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";
import { replayTypeObservations } from "./type-observations-codec.ts";
import { replayTypeProjection } from "./type-projection-codec.ts";
import type { NativeTypeProjection } from "./type-projection-contract.ts";
import { mapColumnRowObservation, mapStoredValueObservation } from "./value-observation-codec.ts";
import type { NativeColumnRowObservation, ProjectedStoredValueShape } from "./value-observation-contract.ts";

type Profile = InventoryInvocationEvidence["profiles"][number];
type WireModule = NonNullable<Profile["module"]> extends InventoryInvocationReference<infer V> ? V : never;
type WireBinding = NonNullable<Profile["binding"]> extends InventoryInvocationReference<infer V> ? V : never;

export function replayInvocationEvidence(
  wire: InventoryInvocationEvidence,
  replayNode: (span: InventorySpan) => MorphNode,
  children: Pick<NativeInvocationEvidence, "declarations" | "computedName" | "globals">,
): NativeInvocationEvidence {
  const { node: replay, observations: readObservations } = ordinaryReplayOwner(wire, replayNode, children.globals);
  const restore = <T, V>(fact: InventoryInvocationReference<T>, value: (input: T) => V): ReferenceFact<V> => replayReferenceFact(fact, value, replay);
  const module = (value: WireModule): ModuleMemberOrigin => replayModuleOrigin(value, replay);
  const origin = (value: WireBinding["target"]): ReferenceOrigin =>
    value.kind === "module" ? module(value) : { ...value, declarations: value.declarations.map(replay) };
  const binding = (value: WireBinding): CallableBinding => {
    const fields = { target: origin(value.target), callee: replay(value.callee), arguments: restore(value.arguments, (nodes) => nodes.map(replay)) };
    const result = value.invocation === "bind" ? { invocation: "bind", ...fields } : fields;
    return result;
  };
  const modules = new Map<MorphNode, ReferenceFact<ModuleMemberOrigin>>();
  const callableBindings = new Map<MorphNode, ReferenceFact<CallableBinding>>();
  const undefinedMembers = new Map<MorphNode, boolean>();
  const namespaces = new Map<MorphNode, readonly MorphNode[]>();
  const strings = new Map<MorphNode, ReferenceFact<string>>();
  const referenceWrites = new Map<MorphNode, ReferenceFact<true>>();
  const authoredComposites = new Map<MorphNode, ReferenceFact<MorphNode>>();
  const stableValues = new Map<MorphNode, ReferenceFact<MorphNode>>();
  const canonicalValues = new Map<MorphNode, ReferenceFact<MorphNode>>();
  const drizzleValueSources = new Map<MorphNode, DrizzleValueSourceEvidence>();
  const typeProjections = new Map<MorphNode, NativeTypeProjection>();
  const authoredValues = new Map<MorphNode, NativeAuthoredValueProjection>();
  const storedValues = new Map<MorphNode, ProjectedStoredValueShape>();
  const columnRows = new Map<MorphNode, NativeColumnRowObservation>();
  const drizzleWrites = new Map<MorphNode, ReferenceFact<DrizzleWrite | null>>();
  const indexedParameters = new Map<MorphNode, readonly IndexedCallParameters[]>();
  for (const profile of wire.profiles) {
    const node = replay(profile.node);
    replaySourceProfile(profile, node, replay, drizzleValueSources);
    if (profile.module !== undefined) {
      modules.set(node, restore(profile.module, module));
    }
    if (profile.binding !== undefined) {
      callableBindings.set(node, restore(profile.binding, binding));
    }
    if (profile.undefined !== undefined) {
      undefinedMembers.set(node, profile.undefined);
    }
    captureNamespace(namespaces, node, profile.namespace, replay);
    if (profile.string !== undefined) {
      strings.set(
        node,
        restore(profile.string, (value) => value),
      );
    }
    replayAdditionalReferences(profile, node, { restore, referenceWrites, authoredComposites, replay });
    if (profile.stable !== undefined) {
      stableValues.set(node, restore(profile.stable, replay));
    }
    if (profile.canonicalValue !== undefined) {
      canonicalValues.set(replay(profile.canonicalValue.declaration), restore(profile.canonicalValue.fact, replay));
    }
    replayValueObservations(profile, node, replay, { stored: storedValues, rows: columnRows, writes: drizzleWrites, indexed: indexedParameters });
    replayDataProfile(profile, node, { plan: wire.query.typeProjection, replay, types: typeProjections, authored: authoredValues });
  }
  const invocation =
    wire.invocation === null
      ? undefined
      : restore(
          wire.invocation,
          (value): CallableInvocation => ({
            invocation: value.invocation,
            target: origin(value.target),
            callee: replay(value.callee),
            arguments: restore(value.arguments, (nodes) => nodes.map(replay)),
          }),
        );
  const observations = readObservations();
  return {
    ...(observations === undefined ? {} : { observations }),
    ...replayTypeAttachment(wire, replayNode),
    invocation,
    modules,
    callableBindings,
    undefinedMembers,
    namespaces,
    strings,
    ...optionalReferenceFacets(referenceWrites, authoredComposites),
    stableValues,
    canonicalValues,
    typeProjections,
    ...sourceAttachment(wire, drizzleValueSources),
    authoredValues,
    storedValues,
    columnRows,
    drizzleWrites,
    indexedParameters,
    ...children,
  };
}

function replayDataProfile(
  profile: Profile,
  node: MorphNode,
  context: {
    readonly plan: InventoryInvocationPlan["typeProjection"];
    readonly replay: (span: InventorySpan) => MorphNode;
    readonly types: Map<MorphNode, NativeTypeProjection>;
    readonly authored: Map<MorphNode, NativeAuthoredValueProjection>;
  },
): void {
  const { plan, replay, types, authored } = context;
  if (profile["type-projection"] !== undefined) {
    if (plan === undefined) {
      throw new SemanticInventoryError("native type projection has no registered demand");
    }
    types.set(node, replayTypeProjection(profile["type-projection"], plan, replay));
  }
  if (profile["authored-value"] !== undefined) {
    authored.set(node, replayAuthoredValueProjection(profile["authored-value"], replay));
  }
}

function captureNamespace(
  map: Map<MorphNode, readonly MorphNode[]>,
  node: MorphNode,
  declarations: InventorySpan[] | undefined,
  replay: (span: InventorySpan) => MorphNode,
): void {
  if (declarations !== undefined) {
    map.set(node, declarations.map(replay));
  }
}

function replayValueObservations(
  profile: Profile,
  node: MorphNode,
  replay: (span: InventorySpan) => MorphNode,
  maps: {
    readonly stored: Map<MorphNode, ProjectedStoredValueShape>;
    readonly rows: Map<MorphNode, NativeColumnRowObservation>;
    readonly writes: Map<MorphNode, ReferenceFact<DrizzleWrite | null>>;
    readonly indexed: Map<MorphNode, readonly IndexedCallParameters[]>;
  },
): void {
  if (profile["stored-value"] !== undefined) {
    maps.stored.set(node, mapStoredValueObservation(profile["stored-value"], replay));
  }
  if (profile["row-column"] !== undefined) {
    maps.rows.set(node, mapColumnRowObservation(profile["row-column"], replay));
  }
  if (profile["drizzle-write"] !== undefined) {
    maps.writes.set(
      node,
      replayReferenceFact(
        profile["drizzle-write"],
        (value) => (value === null ? null : { ...value, target: replay(value.target), arg: value.arg === null ? undefined : replay(value.arg) }),
        replay,
      ),
    );
  }
  if (profile["indexed-parameters"] !== undefined) {
    maps.indexed.set(
      node,
      profile["indexed-parameters"].map((value) => {
        const indexing = replay(value.node);
        if (!Node.isElementAccessExpression(indexing)) {
          throw new SemanticInventoryError("native helper indexing span is foreign");
        }
        return { ...value, node: indexing };
      }),
    );
  }
}

function ordinaryReplayOwner(
  wire: InventoryInvocationEvidence,
  replayNode: (span: InventorySpan) => MorphNode,
  globals: NativeInvocationEvidence["globals"],
): { readonly node: (span: InventorySpan) => MorphNode; readonly observations: () => NativeOrdinaryObservations | undefined } {
  const payload = wire.observations;
  if (payload === undefined) {
    return { node: replayNode, observations: () => undefined };
  }
  const epochs = new Map<SourceFile, SourceFile["compilerNode"]>();
  const replay = (span: InventorySpan): MorphNode => {
    const node = replayNode(span);
    epochs.set(node.getSourceFile(), node.getSourceFile().compilerNode);
    return node;
  };
  for (const fact of globals.values()) {
    for (const node of [fact.trace.origin, ...fact.trace.declarations, ...(fact.kind === "resolved" ? fact.value.declarations : [fact.node])]) {
      epochs.set(node.getSourceFile(), node.getSourceFile().compilerNode);
    }
  }
  return {
    node: replay,
    observations: (): NativeOrdinaryObservations => {
      const restored = replayOrdinaryObservations(payload, replay);
      return {
        ...restored,
        assertNode: (node): void => {
          replayNode(payload.anchor);
          for (const [source, epoch] of epochs) {
            if (source.wasForgotten() || source.compilerNode !== epoch) {
              throw new SemanticInventoryError("native ordinary closed source epoch is stale");
            }
          }
          restored.assertNode(node);
        },
      };
    },
  };
}

function typeReplayOwner(
  payload: NonNullable<InventoryInvocationEvidence["typeObservations"]>,
  replayNode: (span: InventorySpan) => MorphNode,
): NonNullable<NativeInvocationEvidence["typeObservations"]> {
  const epochs = new Map<SourceFile, SourceFile["compilerNode"]>();
  const replay = (span: InventorySpan): MorphNode => {
    const node = replayNode(span);
    epochs.set(node.getSourceFile(), node.getSourceFile().compilerNode);
    return node;
  };
  const restored = replayTypeObservations(payload, replay);
  return {
    ...restored,
    assertNode: (node): void => {
      replayNode(payload.anchor);
      for (const [source, epoch] of epochs) {
        if (source.wasForgotten() || source.compilerNode !== epoch) {
          throw new SemanticInventoryError("native type observation closed source epoch is stale");
        }
      }
      restored.assertNode(node);
    },
  };
}

function replayTypeAttachment(
  wire: InventoryInvocationEvidence,
  replay: (span: InventorySpan) => MorphNode,
): Pick<NativeInvocationEvidence, "typeObservations"> {
  return wire.typeObservations === undefined ? {} : { typeObservations: typeReplayOwner(wire.typeObservations, replay) };
}

function optionalReferenceFacets(
  referenceWrites: NonNullable<NativeInvocationEvidence["referenceWrites"]>,
  authoredComposites: NonNullable<NativeInvocationEvidence["authoredComposites"]>,
): Pick<NativeInvocationEvidence, "referenceWrites" | "authoredComposites"> {
  return { ...(referenceWrites.size === 0 ? {} : { referenceWrites }), ...(authoredComposites.size === 0 ? {} : { authoredComposites }) };
}
function replayAdditionalReferences(
  profile: Profile,
  node: MorphNode,
  context: {
    readonly restore: <T, V>(fact: InventoryInvocationReference<T>, value: (input: T) => V) => ReferenceFact<V>;
    readonly referenceWrites: Map<MorphNode, ReferenceFact<true>>;
    readonly authoredComposites: Map<MorphNode, ReferenceFact<MorphNode>>;
    readonly replay: (span: InventorySpan) => MorphNode;
  },
): void {
  if (profile["reference-writes"] !== undefined) {
    context.referenceWrites.set(
      node,
      context.restore(profile["reference-writes"], (value) => value),
    );
  }
  if (profile["authored-composite"] !== undefined) {
    context.authoredComposites.set(node, context.restore(profile["authored-composite"], context.replay));
  }
}
function replaySourceProfile(
  profile: Profile,
  node: MorphNode,
  replay: (span: InventorySpan) => MorphNode,
  sources: Map<MorphNode, DrizzleValueSourceEvidence>,
): void {
  if (profile["drizzle-value-sources"] !== undefined) {
    sources.set(node, replayDrizzleValueSourceEvidence(profile["drizzle-value-sources"], replay));
  }
}
function sourceAttachment(
  wire: InventoryInvocationEvidence,
  sources: ReadonlyMap<MorphNode, DrizzleValueSourceEvidence>,
): Pick<NativeInvocationEvidence, "drizzleValueSources"> {
  return wire.drizzleSourcesBasis === undefined ? {} : { drizzleValueSources: sources };
}
