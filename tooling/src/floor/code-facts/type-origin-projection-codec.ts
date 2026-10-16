// Origin closure wires retain bounded canonical query answers and their complete annotation coverage.
import type { Node as MorphNode, TypeNode } from "ts-morph";
import type { InventoryTypeOriginProjection, WireIdentity } from "./projection-inventory-contract.ts";
import { replayReferenceFact, wireReferenceFact } from "./projection-reference-codec.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { InventoryInvocationReference, InventorySpan } from "./semantic-inventory-contract.ts";
import type { TypeIdentityOrigin } from "./type-member-origin-contract.ts";
import type { NativeTypeOriginProjection } from "./type-origin-projection-contract.ts";
import { assertTypeOriginCoverage, typeOriginAnnotationClosure } from "./type-origin-projection-contract.ts";

/** Canonical readers have already supplied meaning; encoding only replaces anchors. */
export function encodeTypeOriginProjection(projection: NativeTypeOriginProjection, span: (node: MorphNode) => InventorySpan): InventoryTypeOriginProjection {
  assertTypeOriginCoverage(projection);
  const identity = (value: TypeIdentityOrigin): WireIdentity => ({ ...value, node: span(value.node), declarations: value.declarations.map(span) });
  const origin = (fact: ReferenceFact<TypeIdentityOrigin>): InventoryInvocationReference<WireIdentity> => wireReferenceFact(fact, identity, span);
  const property = projection.bindingProperty;
  return {
    root: span(projection.root),
    stable: wireReferenceFact(projection.stable, span, span),
    binding: wireReferenceFact(projection.binding, span, span),
    bindingProperty:
      property === null
        ? null
        : {
            binding: span(property.binding),
            receiver: property.receiver === null ? null : span(property.receiver),
            key: wireReferenceFact(property.key, (value) => value, span),
            declarations: property.declarations === null ? null : wireReferenceFact(property.declarations, (nodes) => nodes.map(span), span),
          },
    values: projection.values.map((value) => ({
      node: span(value.node),
      identities: wireReferenceFact(value.identities, (identities) => identities.map(identity), span),
      member: wireReferenceFact(value.member, (nodes) => nodes.map(span), span),
    })),
    annotations: projection.annotations.map((value) => ({
      annotation: span(value.annotation),
      direct: value.direct === null ? null : origin(value.direct),
      scalar: value.scalar.map(origin),
    })),
    callable: projection.callable === null ? null : wireReferenceFact(projection.callable, span, span),
  };
}

/** Completeness checks use replayed syntax/relationships, never an ordinary checker. */
export function replayTypeOriginProjection(wire: InventoryTypeOriginProjection, replay: (span: InventorySpan) => MorphNode): NativeTypeOriginProjection {
  const identity = (value: WireIdentity): TypeIdentityOrigin => ({ ...value, node: replay(value.node), declarations: value.declarations.map(replay) });
  const origin = (fact: InventoryInvocationReference<WireIdentity>): ReferenceFact<TypeIdentityOrigin> => replayReferenceFact(fact, identity, replay);
  const property = wire.bindingProperty;
  const basis: Omit<NativeTypeOriginProjection, "annotations"> = {
    root: replay(wire.root),
    stable: replayReferenceFact(wire.stable, replay, replay),
    binding: replayReferenceFact(wire.binding, replay, replay),
    bindingProperty:
      property === null
        ? null
        : {
            binding: replay(property.binding),
            receiver: property.receiver === null ? null : replay(property.receiver),
            key: replayReferenceFact(property.key, (value) => value, replay),
            declarations: property.declarations === null ? null : replayReferenceFact(property.declarations, (nodes) => nodes.map(replay), replay),
          },
    values: wire.values.map((value) => ({
      node: replay(value.node),
      identities: replayReferenceFact(value.identities, (identities) => identities.map(identity), replay),
      member: replayReferenceFact(value.member, (nodes) => nodes.map(replay), replay),
    })),
    callable: wire.callable === null ? null : replayReferenceFact(wire.callable, replay, replay),
  };
  const admitted = typeOriginAnnotationClosure(basis);
  const annotation = (span: InventorySpan): TypeNode => {
    const replayed = replay(span);
    const node = admitted.find((candidate) => candidate === replayed);
    if (node === undefined) {
      throw new Error("native annotation origin is not an admitted type node");
    }
    return node;
  };
  const projection: NativeTypeOriginProjection = {
    ...basis,
    annotations: wire.annotations.map((value) => ({
      annotation: annotation(value.annotation),
      direct: value.direct === null ? null : origin(value.direct),
      scalar: value.scalar.map(origin),
    })),
  };
  assertTypeOriginCoverage(projection);
  return projection;
}
