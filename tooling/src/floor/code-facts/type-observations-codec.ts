// Raw Type/Symbol observation serialization translates only canonical node/span anchors.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import type { NativeTypeObservation, NativeTypeObservations, TypeObservationDemand, TypeObservationValues } from "./type-observations-contract.ts";
import type { InventoryTypeObservations } from "./type-observations-inventory.ts";
import { mapTypeSelectionPlan } from "./type-projection-codec.ts";

function mapObservation<From, To>(fact: NativeTypeObservation<From>, value: (input: From) => To): NativeTypeObservation<To> {
  return fact.kind === "value" ? { kind: "value", value: value(fact.value) } : fact;
}
export function mapTypeObservationDemand<From, To>(demand: TypeObservationDemand<From>, node: (value: From) => To): TypeObservationDemand<To> {
  const { questions, ...base } = demand;
  return {
    ...base,
    sources: demand.sources.map(node),
    nodes: demand.nodes.map(node),
    ...(questions === undefined ? {} : { questions: questions.map((q) => ({ ...q, nodes: q.nodes.map(node) })) }),
  };
}
export function mapTypeObservationValues<From, To>(facts: TypeObservationValues<From>, node: (value: From) => To): TypeObservationValues<To> {
  const {
    constInitializers: _constInitializers,
    signatureDeclarations: _signatureDeclarations,
    definitions: _definitions,
    functionExports: _functionExports,
    callParameters: _callParameters,
    signatureParameters: _signatureParameters,
    exportDeclarations: _exportDeclarations,
    callableBodies: _callableBodies,
    valueProfiles: _valueProfiles,
    ...base
  } = facts;
  return {
    ...base,
    anchor: node(facts.anchor),
    demand: mapTypeObservationDemand(facts.demand, node),
    symbols: facts.symbols.map(({ valueDeclaration, ...symbol }) => ({
      ...symbol,
      declarations: symbol.declarations.map(node),
      ...(valueDeclaration === undefined ? {} : { valueDeclaration: valueDeclaration === null ? null : node(valueDeclaration) }),
    })),
    ...(facts.constInitializers === undefined
      ? {}
      : { constInitializers: facts.constInitializers.map((row) => ({ node: node(row.node), values: row.values.map(node) })) }),
    ...(facts.signatureDeclarations === undefined
      ? {}
      : { signatureDeclarations: facts.signatureDeclarations.map((entry) => ({ ...entry, declarations: entry.declarations.map(node) })) }),
    ...(facts.definitions === undefined ? {} : { definitions: facts.definitions.map((entry) => ({ node: node(entry.node), values: entry.values.map(node) })) }),
    ...(facts.callableBodies === undefined
      ? {}
      : { callableBodies: facts.callableBodies.map((entry) => ({ node: node(entry.node), body: entry.body === null ? null : node(entry.body) })) }),
    ...(facts.exportDeclarations === undefined
      ? {}
      : {
          exportDeclarations: facts.exportDeclarations.map((entry) => ({
            ...entry,
            source: node(entry.source),
            declarations: entry.declarations?.map(node) ?? null,
          })),
        }),
    ...(facts.functionExports === undefined ? {} : { functionExports: facts.functionExports.map((entry) => ({ ...entry, node: node(entry.node) })) }),
    ...(facts.callParameters === undefined ? {} : { callParameters: facts.callParameters.map((entry) => ({ ...entry, call: node(entry.call) })) }),
    ...(facts.signatureParameters === undefined ? {} : { signatureParameters: facts.signatureParameters.map((entry) => ({ ...entry, at: node(entry.at) })) }),
    ...(facts.valueProfiles === undefined ? {} : { valueProfiles: facts.valueProfiles.map((entry) => ({ ...entry, node: node(entry.node) })) }),
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
