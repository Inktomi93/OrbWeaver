// Source spans retain exact native configuration closure; replay never re-resolves module or scalar meaning.
import type { Node as MorphNode } from "ts-morph";
import { encodeAuthoredValueProjection, replayAuthoredValueProjection } from "./authored-value-projection-codec.ts";
import { encodeModuleOrigin, replayModuleOrigin } from "./module-origin-codec.ts";
import { replayReferenceFact, wireReferenceFact } from "./projection-reference-codec.ts";
import { schemaConfigurationChildren } from "./schema-configuration-children.ts";
import type { SchemaConfiguration } from "./schema-configuration-contract.ts";
import type { InventorySchemaConfiguration } from "./schema-configuration-inventory-contract.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";

/** Preserve ordered object overrides and each canonical value observation without a policy answer. */
export function encodeSchemaConfiguration(input: SchemaConfiguration, span: (node: MorphNode) => InventorySpan): InventorySchemaConfiguration {
  return {
    entries: wireReferenceFact(input.entries, (entries) => entries.map(({ name, value }) => ({ name, value: span(value) })), span),
    values: input.values.map((value) => ({
      node: span(value.node),
      module: wireReferenceFact(value.module, (origin) => encodeModuleOrigin(origin, span), span),
      stable: wireReferenceFact(value.stable, span, span),
      authored: encodeAuthoredValueProjection(value.authored, span),
      children: value.children.map(span),
    })),
  };
}

/** Missing, duplicated or orphaned graph entries are unavailable capture, not an unknown tuple. */
export function replaySchemaConfiguration(input: InventorySchemaConfiguration, replay: (span: InventorySpan) => MorphNode): SchemaConfiguration {
  const entries = replayReferenceFact(input.entries, (properties) => properties.map(({ name, value }) => ({ name, value: replay(value) })), replay);
  const values = input.values.map((value) => ({
    node: replay(value.node),
    module: replayReferenceFact(value.module, (origin) => replayModuleOrigin(origin, replay), replay),
    stable: replayReferenceFact(value.stable, replay, replay),
    authored: replayAuthoredValueProjection(value.authored, replay),
    children: value.children.map(replay),
  }));
  const byNode = new Map(values.map((value) => [value.node, value]));
  if (byNode.size !== values.length) {
    throw new Error("native schema configuration value coverage is ambiguous");
  }
  const visited = new Set<MorphNode>();
  const visit = (node: MorphNode): void => {
    if (visited.has(node)) {
      return;
    }
    const value = byNode.get(node);
    if (value === undefined) {
      throw new Error("native schema configuration value coverage is incomplete");
    }
    visited.add(node);
    const expected = schemaConfigurationChildren(node, value.stable);
    if (expected.length !== value.children.length || expected.some((child, index) => child !== value.children[index])) {
      throw new Error("native schema configuration syntax dependencies are incomplete or foreign");
    }
    for (const child of value.children) {
      visit(child);
    }
  };
  if (entries.kind === "resolved") {
    for (const entry of entries.value) {
      visit(entry.value);
    }
  }
  if (visited.size !== byNode.size) {
    throw new Error("native schema configuration value coverage is foreign");
  }
  return { entries, values };
}
