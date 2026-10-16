// Project only after complete canonical extraction; no partial table/column parser may mint this catalog.
import type { SchemaFact, SchemaModel, SchemaQueryOptions } from "./schema-model-contract.ts";
import type { SchemaDataProjection, SchemaProjectedModel } from "./schema-projection-contract.ts";
import { createSchemaQuery } from "./schema-query.ts";
import { captureTypeVocabulary } from "./type-projection.ts";

/** Retain every extracted value except the live Type, whose identity cannot cross native Programs. */
export function projectSchemaData(fact: SchemaFact<SchemaModel>, projection: SchemaDataProjection = {}): SchemaFact<SchemaProjectedModel> {
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
                  : {
                      node: column.typeOverride.node,
                      display: column.typeOverride.display,
                      idBrand: column.typeOverride.idBrand,
                      ...(projection.typeVocabulary === true && column.json !== null ? { vocabulary: captureTypeVocabulary(column.typeOverride.type) } : {}),
                    },
            })),
          })),
        },
      }
    : fact;
}

/** Complete defaults, foreign keys, indexes and JSON extraction must succeed before projection. */
export function readSchemaData(options: SchemaQueryOptions, projection: SchemaDataProjection = {}): SchemaFact<SchemaProjectedModel> {
  return projectSchemaData(createSchemaQuery(options).schema(), projection);
}
