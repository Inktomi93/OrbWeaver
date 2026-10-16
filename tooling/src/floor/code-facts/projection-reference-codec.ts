// Shared native reference encoding retains canonical ordered traces and refusal fields.
import type { Node } from "ts-morph";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { InventoryInvocationReference, InventorySpan } from "./semantic-inventory-contract.ts";

/** Preserve ordered native trace/refusal fields across type-free evidence families. */
export function wireReferenceFact<T, Value>(
  fact: ReferenceFact<T>,
  value: (input: T) => Value,
  span: (node: Node) => InventorySpan,
): InventoryInvocationReference<Value> {
  const trace = { origin: span(fact.trace.origin), declarations: fact.trace.declarations.map(span) };
  if (fact.kind === "resolved") {
    return { kind: fact.kind, value: value(fact.value), trace };
  }
  return {
    kind: fact.kind,
    reason: fact.reason,
    detail: fact.detail,
    node: span(fact.node),
    trace,
    ...("capture" in fact && fact.capture === "native-bind" ? { capture: "native-bind" as const } : {}),
  };
}

/** Restore ordered trace and refusal data without consulting syntax-carrier meaning. */
export function replayReferenceFact<T, V>(
  fact: InventoryInvocationReference<T>,
  value: (input: T) => V,
  replay: (span: InventorySpan) => Node,
): ReferenceFact<V> {
  const trace = { origin: replay(fact.trace.origin), declarations: fact.trace.declarations.map(replay) };
  return fact.kind === "resolved"
    ? { kind: fact.kind, value: value(fact.value), trace }
    : {
        kind: fact.kind,
        reason: fact.reason,
        detail: fact.detail,
        node: replay(fact.node),
        trace,
        ...(fact.capture === undefined ? {} : { capture: fact.capture }),
      };
}
