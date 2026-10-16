// Ordered authored data is flat on the wire; numeric text preserves -0 and nonfinite native answers.
import type { Node } from "ts-morph";
import type { NativeAuthoredValueProjection } from "./authored-value-projection.ts";
import type {
  InventoryAuthoredEntry,
  InventoryAuthoredScalar,
  InventoryAuthoredTree,
  InventoryAuthoredValueProjection,
} from "./projection-inventory-contract.ts";
import { authoredNumberText } from "./projection-inventory-contract.ts";
import { replayReferenceFact, wireReferenceFact } from "./projection-reference-codec.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import { authoredValueProjectionSchema } from "./semantic-inventory-contract.ts";
import type { StaticAuthoredScalar, StaticAuthoredValue } from "./static-authored-value-contract.ts";

function encodeTree(value: StaticAuthoredValue, span: (node: Node) => InventorySpan): InventoryAuthoredTree {
  const entries: InventoryAuthoredEntry[] = [];
  const visit = (input: StaticAuthoredValue): number => {
    const node = span(input.node);
    let entry: InventoryAuthoredEntry;
    if (input.kind === "scalar") {
      entry = { kind: input.kind, node, value: encodeScalar(input.value) };
    } else if (input.kind === "tuple") {
      entry = { kind: input.kind, node, elements: input.elements.map(visit) };
    } else {
      entry = {
        kind: input.kind,
        node,
        properties: input.properties.map((property) => ({ key: property.key, keyNode: span(property.keyNode), value: visit(property.value) })),
      };
    }
    const index = entries.length;
    entries.push(entry);
    return index;
  };
  const root = visit(value);
  return { root, entries };
}

function encodeScalar(value: StaticAuthoredScalar): InventoryAuthoredScalar {
  if (value === null) {
    return { kind: "null" };
  }
  if (typeof value === "number") {
    return { kind: "number", value: authoredNumberText(value) };
  }
  return typeof value === "string" ? { kind: "string", value } : { kind: "boolean", value };
}

function replayScalar(value: InventoryAuthoredScalar): StaticAuthoredScalar {
  if (value.kind === "null") {
    return null;
  }
  return value.kind === "number" ? Number(value.value) : value.value;
}

function replayTree(tree: InventoryAuthoredTree, replay: (span: InventorySpan) => Node): StaticAuthoredValue {
  const visited = new Set<number>();
  const visit = (index: number): StaticAuthoredValue => {
    const entry = tree.entries[index];
    if (entry === undefined || visited.has(index)) {
      throw new Error("native authored value tree has missing, repeated or cyclic entry coverage");
    }
    visited.add(index);
    const node = replay(entry.node);
    if (entry.kind === "scalar") {
      return { kind: entry.kind, node, value: replayScalar(entry.value) };
    }
    if (entry.kind === "tuple") {
      return { kind: entry.kind, node, elements: entry.elements.map(visit) };
    }
    return {
      kind: entry.kind,
      node,
      properties: entry.properties.map((property) => ({ key: property.key, keyNode: replay(property.keyNode), value: visit(property.value) })),
    };
  };
  const value = visit(tree.root);
  if (visited.size !== tree.entries.length) {
    throw new Error("native authored value tree has foreign entry coverage");
  }
  return value;
}

/** Encode the two independent canonical answers, preserving all authored entry and trace anchors. */
export function encodeAuthoredValueProjection(
  projection: NativeAuthoredValueProjection,
  span: (node: Node) => InventorySpan,
): InventoryAuthoredValueProjection {
  return authoredValueProjectionSchema.parse({
    value: wireReferenceFact(projection.value, (value) => encodeTree(value, span), span),
    composite: wireReferenceFact(projection.composite, span, span),
  });
}

/** A malformed or incomplete tree refuses; an unreadable canonical value remains a delivered refusal. */
export function replayAuthoredValueProjection(wire: InventoryAuthoredValueProjection, replay: (span: InventorySpan) => Node): NativeAuthoredValueProjection {
  const parsed = authoredValueProjectionSchema.parse(wire);
  return {
    value: replayReferenceFact(parsed.value, (value) => replayTree(value, replay), replay),
    composite: replayReferenceFact(parsed.composite, replay, replay),
  };
}
