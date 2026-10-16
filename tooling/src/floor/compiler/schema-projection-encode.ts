// Encode complete canonical schema data through the existing inventory span and roster vocabulary.
import type { Node, SourceFile } from "ts-morph";
import type { SchemaFact } from "../code-facts/schema-model-contract.ts";
import type { SchemaProjectedColumn, SchemaProjectedModel } from "../code-facts/schema-projection-contract.ts";
import type { InventorySchemaProjectedCatalog, InventorySchemaProjectedColumn } from "../code-facts/schema-projection-inventory-contract.ts";
import { schemaProjectionInventorySchema } from "../code-facts/schema-projection-inventory-contract.ts";
import type { InventorySpan } from "../code-facts/semantic-inventory-contract.ts";
import { drizzleSchemas, spanSchema } from "../code-facts/semantic-inventory-contract.ts";
import { encodeSchemaIdentityCatalog } from "./drizzle-evidence-encode.ts";

const catalogSchema = schemaProjectionInventorySchema(spanSchema, drizzleSchemas.catalog);

function columnData(column: SchemaProjectedColumn, span: (node: Node) => InventorySpan): InventorySchemaProjectedColumn {
  const json = column.json;
  const override = column.typeOverride;
  return {
    ...column,
    declaration: span(column.declaration),
    expression: span(column.expression),
    builder: { ...column.builder, call: span(column.builder.call) },
    typeOverride: override === null ? null : { ...override, node: span(override.node) },
    json:
      json === null
        ? null
        : {
            ...json,
            shape:
              json.shape.kind === "open"
                ? { ...json.shape, typeNode: json.shape.typeNode === null ? null : span(json.shape.typeNode) }
                : { ...json.shape, typeNode: span(json.shape.typeNode) },
          },
    foreignKey: column.foreignKey === null ? null : { ...column.foreignKey, call: span(column.foreignKey.call) },
  };
}

/** Full nested scalar and span data, without a compiler Type or a policy verdict. */
export function encodeSchemaDataCatalog(
  sources: readonly SourceFile[],
  fact: SchemaFact<SchemaProjectedModel>,
  span: (node: Node) => InventorySpan,
  relativePath: (source: SourceFile) => string,
): InventorySchemaProjectedCatalog {
  const identity = encodeSchemaIdentityCatalog(sources, fact, span, relativePath);
  return catalogSchema.parse({
    ...identity,
    fact:
      fact.status === "ready"
        ? {
            ...fact,
            value: {
              tables: fact.value.tables.map((table) => ({
                ...table,
                declaration: span(table.declaration),
                call: span(table.call),
                columns: table.columns.map((column) => columnData(column, span)),
                indexes: table.indexes.map((index) => ({
                  ...index,
                  call: span(index.call),
                  terms: index.terms.map((term) => (term.kind === "expression" ? { ...term, node: span(term.node) } : term)),
                })),
                foreignKeys: table.foreignKeys.map((foreignKey) => ({ ...foreignKey, call: span(foreignKey.call) })),
              })),
            },
          }
        : fact,
  });
}
