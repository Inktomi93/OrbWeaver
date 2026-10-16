// Raw Type/Symbol observation serialization translates only canonical node/span anchors.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import type { NativeTypeObservation, NativeTypeObservations, TypeObservationValues } from "./type-observations-contract.ts";
import type { InventoryTypeObservations } from "./type-observations-inventory.ts";
import { mapTypeSelectionPlan } from "./type-projection-codec.ts";

function mapObservation<From, To>(fact: NativeTypeObservation<From>, value: (input: From) => To): NativeTypeObservation<To> {
  return fact.kind === "value" ? { kind: "value", value: value(fact.value) } : fact;
}
export function mapTypeObservationValues<From, To>(facts: TypeObservationValues<From>, node: (value: From) => To): TypeObservationValues<To> {
  return {
    ...facts,
    anchor: node(facts.anchor),
    demand: { ...facts.demand, sources: facts.demand.sources.map(node), nodes: facts.demand.nodes.map(node) },
    symbols: facts.symbols.map((symbol) => ({ ...symbol, declarations: symbol.declarations.map(node) })),
    nodes: facts.nodes.map((entry) => ({ ...entry, node: node(entry.node) })),
    properties: facts.properties.map((entry) => ({ ...entry, at: node(entry.at) })),
    callReturns: facts.callReturns.map((entry) => ({ ...entry, node: node(entry.node) })),
    computedNames: facts.computedNames.map((entry) => ({
      ...entry,
      values: entry.values.map((value) => ({ declaration: node(value.declaration), names: value.names.map(node) })),
    })),
    signatures: facts.signatures.map((entry) => ({
      ...entry,
      call: node(entry.call),
      fact: mapObservation(entry.fact, (value) => ({ ...value, declaration: node(value.declaration) })),
    })),
    dependencies: facts.dependencies.map((entry) => ({
      ...entry,
      owner: node(entry.owner),
      at: node(entry.at),
      witness: entry.witness === null ? null : node(entry.witness),
    })),
    localTargets: facts.localTargets.map((entry) => ({ ...entry, node: node(entry.node) })),
    exports: facts.exports.map((entry) => ({ ...entry, source: node(entry.source) })),
    selections: facts.selections === null ? null : { ...facts.selections, plan: mapTypeSelectionPlan(facts.selections.plan, node) },
  };
}
export function encodeTypeObservations(facts: NativeTypeObservations, span: (node: MorphNode) => InventorySpan): InventoryTypeObservations {
  const { assertNode: _admit, ...values } = facts;
  return mapTypeObservationValues(values, span);
}
export function replayTypeObservations(wire: InventoryTypeObservations, replay: (span: InventorySpan) => MorphNode): NativeTypeObservations {
  const facts = mapTypeObservationValues(wire, replay);
  if (!Node.isSourceFile(facts.anchor)) {
    throw new Error("native type observation anchor is not an actual source file");
  }
  const anchor = facts.anchor;
  return {
    ...facts,
    anchor,
    assertNode: (node): void => {
      const span = { file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
      if (replay(span) !== node) {
        throw new Error("native type observation query belongs to a foreign source epoch");
      }
    },
  };
}
