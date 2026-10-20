// Stable text projections of captured call-return facts, so two captures compare by value.
import type { Node } from "ts-morph";
import type { CallReturnAlternative, CallReturnObservation, ReferenceFact } from "../../../../tooling/src/floor/code-facts/reference-fact-contract.ts";

export function capturedNodeText(node: Node): string {
  return JSON.stringify([node.getSourceFile().getFilePath(), node.getKind(), node.getStart(), node.getEnd()]);
}

export function capturedFactText<T>(fact: ReferenceFact<T> | undefined, value: (item: T) => string | readonly string[]): string {
  if (fact === undefined) {
    return "absent";
  }
  const trace = { origin: capturedNodeText(fact.trace.origin), declarations: fact.trace.declarations.map(capturedNodeText) };
  return JSON.stringify(
    fact.kind === "resolved"
      ? { kind: fact.kind, value: value(fact.value), trace }
      : { kind: fact.kind, reason: fact.reason, detail: fact.detail, node: capturedNodeText(fact.node), trace },
  );
}

export function capturedAlternativeText(value: CallReturnAlternative): string {
  const nodes = (values: readonly Node[]): readonly string[] => values.map(capturedNodeText);
  return JSON.stringify({
    target: capturedNodeText(value.target),
    returns: capturedFactText(value.returns, nodes),
    explicit: capturedFactText(value.explicitReturns, nodes),
    native: capturedFactText(value.nativeReturns, nodes),
  });
}

export function capturedObservationText(value: CallReturnObservation): string {
  const nodes = (values: readonly Node[]): readonly string[] => values.map(capturedNodeText);
  return JSON.stringify({
    call: capturedNodeText(value.call),
    target: capturedFactText(value.target, capturedNodeText),
    targets: capturedFactText(value.targets, nodes),
    invocation: capturedFactText(value.invocationTargets, nodes),
    returns: capturedFactText(value.returns, nodes),
    alternatives: capturedFactText(value.alternatives, (values) => values.map(capturedAlternativeText)),
  });
}
