// Project only after complete canonical extraction; no partial table/column parser may mint this catalog.
import type { SchemaFact, SchemaModel, SchemaQueryOptions } from "./schema-model-contract.ts";
import type { SchemaProjectedModel } from "./schema-projection-contract.ts";
import { createSchemaQuery } from "./schema-query.ts";

/** Retain every extracted value except the live Type, whose identity cannot cross native Programs. */
export function projectSchemaData(fact: SchemaFact<SchemaModel>): SchemaFact<SchemaProjectedModel> {
  return fact.status === "ready"
    ? {
        ...fact,
        value: {
          tables: fact.value.tables.map((table) => ({
            ...table,
            columns: table.columns.map((column) => ({
              ...column,
              typeOverride:
                column.typeOverride === null
                  ? null
                  : { node: column.typeOverride.node, display: column.typeOverride.display, idBrand: column.typeOverride.idBrand },
            })),
          })),
        },
      }
    : fact;
}

/** Complete defaults, foreign keys, indexes and JSON extraction must succeed before projection. */
export function readSchemaData(options: SchemaQueryOptions): SchemaFact<SchemaProjectedModel> {
  return projectSchemaData(createSchemaQuery(options).schema());
}
