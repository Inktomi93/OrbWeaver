// Replay uses the inventory's owner-qualified span resolver; it never recreates schema or Type meaning.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { replaySchemaIdentityCatalog } from "./drizzle-evidence-replay.ts";
import type { SchemaFact } from "./schema-model-contract.ts";
import type { SchemaProjectedColumn, SchemaProjectedModel } from "./schema-projection-contract.ts";
import type { InventorySchemaProjectedCatalog, InventorySchemaProjectedColumn } from "./schema-projection-inventory-contract.ts";
import { schemaProjectionInventorySchema } from "./schema-projection-inventory-contract.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";
import { drizzleSchemas, SemanticInventoryError, spanSchema } from "./semantic-inventory-contract.ts";

const catalogSchema = schemaProjectionInventorySchema(spanSchema, drizzleSchemas.catalog);

function replayCall(span: InventorySpan, replay: (span: InventorySpan) => MorphNode): CallExpression {
  const node = replay(span);
  if (!Node.isCallExpression(node)) {
    throw new SemanticInventoryError("native schema projection call span is foreign");
  }
  return node;
}

function columnData(column: InventorySchemaProjectedColumn, replay: (span: InventorySpan) => MorphNode): SchemaProjectedColumn {
  const json = column.json;
  const override = column.typeOverride;
  return {
    ...column,
    declaration: replay(column.declaration),
    expression: replay(column.expression),
    builder: { ...column.builder, call: replayCall(column.builder.call, replay) },
    typeOverride: override === null ? null : { ...override, node: replay(override.node) },
    json:
      json === null
        ? null
        : {
            ...json,
            shape:
              json.shape.kind === "open"
                ? { ...json.shape, typeNode: json.shape.typeNode === null ? null : replay(json.shape.typeNode) }
                : { ...json.shape, typeNode: replay(json.shape.typeNode) },
          },
    foreignKey: column.foreignKey === null ? null : { ...column.foreignKey, call: replayCall(column.foreignKey.call, replay) },
  };
}

/** Recorded empty/missing/refused statuses survive; absent or malformed nested data refuses decoding. */
export function replaySchemaDataCatalog(input: InventorySchemaProjectedCatalog, replay: (span: InventorySpan) => MorphNode): SchemaFact<SchemaProjectedModel> {
  const wire = catalogSchema.parse(input);
  const identity = replaySchemaIdentityCatalog(wire, replay);
  const fact = wire.fact;
  if (fact.status !== "ready") {
    return fact;
  }
  if (identity.status !== "ready") {
    throw new SemanticInventoryError("native schema projection status disagrees with table identities");
  }
  return {
    ...fact,
    value: {
      tables: fact.value.tables.map((table, tableIndex) => {
        const restored = identity.value.tables[tableIndex];
        if (restored === undefined) {
          throw new SemanticInventoryError("native schema projection table identity is missing");
        }
        return {
          ...table,
          declaration: restored.declaration,
          call: restored.call,
          columns: table.columns.map((column) => columnData(column, replay)),
          indexes: table.indexes.map((index) => ({
            ...index,
            call: replayCall(index.call, replay),
            terms: index.terms.map((term) => (term.kind === "expression" ? { ...term, node: replay(term.node) } : term)),
          })),
          foreignKeys: table.foreignKeys.map((foreignKey) => ({ ...foreignKey, call: replayCall(foreignKey.call, replay) })),
        };
      }),
    },
  };
}
