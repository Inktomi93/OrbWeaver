// Canonical object extraction closes over native tuple/spread observations before publication.
import type { Node as MorphNode } from "ts-morph";
import { captureAuthoredValueProjection } from "./authored-value-projection.ts";
import { resolveModuleMemberOrigin, resolveStableExpression } from "./reference-fact.ts";
import { schemaConfigurationChildren } from "./schema-configuration-children.ts";
import type { SchemaConfiguration, SchemaConfigurationValue } from "./schema-configuration-contract.ts";
import { objectEntries, resolved, SchemaRefusal } from "./schema-value.ts";

/** Preserve the canonical property refusal independently of a complete schema's readiness. */
export function captureSchemaConfiguration(node: MorphNode): SchemaConfiguration {
  let entries: SchemaConfiguration["entries"];
  try {
    entries = resolved(
      objectEntries(node, "Drizzle column config").map(({ name, value }) => ({ name, value })),
      node,
    );
  } catch (error) {
    if (!(error instanceof SchemaRefusal)) {
      throw error;
    }
    return { entries: error.fact, values: [] };
  }
  const values = new Map<MorphNode, SchemaConfigurationValue>();
  const capture = (value: MorphNode): void => {
    if (values.has(value)) {
      return;
    }
    const stable = resolveStableExpression(value);
    const children = schemaConfigurationChildren(value, stable);
    values.set(value, { node: value, module: resolveModuleMemberOrigin(value), stable, authored: captureAuthoredValueProjection(value), children });
    for (const child of children) {
      capture(child);
    }
  };
  for (const entry of entries.value) {
    capture(entry.value);
  }
  return { entries, values: [...values.values()] };
}
