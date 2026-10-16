// Project only after complete canonical extraction; no partial table/column parser may mint this catalog.

import { captureSchemaConfiguration } from "./schema-configuration.ts";
import type { SchemaColumn, SchemaFact, SchemaModel, SchemaQueryOptions } from "./schema-model-contract.ts";
import type { SchemaDataProjection, SchemaProjectedColumn, SchemaProjectedModel } from "./schema-projection-contract.ts";
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
            columns: table.columns.map((column) => projectColumn(column, projection)),
          })),
        },
      }
    : fact;
}

function projectColumn(column: SchemaColumn, projection: SchemaDataProjection): SchemaProjectedColumn {
  const configuration = projection.builderConfig === true ? column.builder.call.getArguments()[1] : undefined;
  const override = column.typeOverride;
  return {
    ...column,
    ...(projection.builderConfig === true ? { configuration: configuration === undefined ? null : captureSchemaConfiguration(configuration) } : {}),
    typeOverride:
      override === null
        ? null
        : {
            node: override.node,
            display: override.display,
            idBrand: override.idBrand,
            ...(projection.typeVocabulary === true && column.json !== null ? { vocabulary: captureTypeVocabulary(override.type) } : {}),
          },
  };
}

/** Complete defaults, foreign keys, indexes and JSON extraction must succeed before projection. */
export function readSchemaData(options: SchemaQueryOptions, projection: SchemaDataProjection = {}): SchemaFact<SchemaProjectedModel> {
  return projectSchemaData(createSchemaQuery(options).schema(), projection);
}
