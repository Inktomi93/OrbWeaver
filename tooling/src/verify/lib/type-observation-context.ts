// One native source request shares only explicitly captured worlds; related nodes stay with their root's reader.

import type { Node, SourceFile } from "ts-morph";
import { Node as MorphNode } from "ts-morph";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { canonicalInventoryPath } from "../../floor/code-facts/semantic-inventory-inputs.ts";
import type { NativeTypeObservations, TypeObservationQuestion, TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";

export function typeObservationPlan(
  sources: readonly SourceFile[],
  nodes: readonly Node[],
  questions?: readonly TypeObservationQuestion[],
): InventoryInvocationPlan {
  const span = (node: Node): import("../../floor/code-facts/semantic-inventory-contract.ts").InventorySpan => ({
    file: canonicalInventoryPath(node.getSourceFile().getFilePath()),
    start: node.getStart(),
    end: node.getEnd(),
    kind: node.getKind(),
  });
  return {
    mode: "types",
    facets: [],
    arguments: [],
    typeObservations: {
      profile: TYPE_OBSERVATION_PROFILE,
      sources: sources.map(span),
      nodes: nodes.map(span),
      ...(questions === undefined ? {} : { questions: questions.map((question) => ({ ...question, nodes: question.nodes.map(span) })) }),
    },
  };
}
export function typeObservationReaders(delivered: ReadonlyMap<Node, NativeInvocationEvidence>): ReadonlyMap<SourceFile, TypeObservationReader> {
  const readers = new Map<NativeTypeObservations, TypeObservationReader>();
  const result = new Map<SourceFile, TypeObservationReader>();
  for (const [source, evidence] of delivered) {
    const facts = evidence.typeObservations;
    if (facts === undefined) {
      throw new Error("native raw Type observations are unavailable");
    }
    if (!(MorphNode.isSourceFile(source) && facts.demand.sources.includes(source))) {
      throw new Error("native type observation source is outside its registered cohort");
    }
    const file = source;
    let reader = readers.get(facts);
    if (reader === undefined) {
      reader = readTypeObservations(facts);
      readers.set(facts, reader);
    }
    result.set(file, reader);
  }
  return result;
}
