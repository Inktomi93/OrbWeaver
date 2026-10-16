// Closed wire projection of canonical schema data; all nested authored nodes retain exact spans.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { z } from "zod";
import type { InventorySchemaIdentityCatalog } from "./drizzle-inventory-contract.ts";
import { assertSchemaIdentityCatalog } from "./drizzle-inventory-contract.ts";
import type { SchemaFact, SchemaForeignKey, SchemaIndex, SchemaJsonShape, SchemaTableForeignKey } from "./schema-model-contract.ts";
import { SCHEMA_COLUMN_DEFAULT_OPERATIONS, SCHEMA_FACT_STATUSES } from "./schema-model-contract.ts";
import type { SchemaProjectedColumn, SchemaProjectedTable, SchemaProjectedTypeOverride } from "./schema-projection-contract.ts";
import type { InventorySpan } from "./semantic-inventory-contract.ts";

type SpanFields<Value> = { readonly [Key in keyof Value]: Value[Key] extends Node ? InventorySpan : Value[Key] };

type InventorySchemaJsonShape =
  | { readonly kind: "open"; readonly typeNode: InventorySpan | null }
  | SpanFields<Exclude<SchemaJsonShape, { readonly kind: "open" }>>;

export interface InventorySchemaProjectedColumn extends Omit<SpanFields<SchemaProjectedColumn>, "builder" | "typeOverride" | "json" | "foreignKey"> {
  readonly builder: SpanFields<SchemaProjectedColumn["builder"]>;
  readonly typeOverride: SpanFields<SchemaProjectedTypeOverride> | null;
  readonly json: { readonly mode: "json"; readonly shape: InventorySchemaJsonShape } | null;
  readonly foreignKey: SpanFields<SchemaForeignKey> | null;
}

type InventorySchemaIndex = Omit<SpanFields<SchemaIndex>, "terms"> & {
  readonly terms: readonly SpanFields<SchemaIndex["terms"][number]>[];
};

export interface InventorySchemaProjectedTable extends Omit<SpanFields<SchemaProjectedTable>, "columns" | "indexes" | "foreignKeys"> {
  readonly columns: readonly InventorySchemaProjectedColumn[];
  readonly indexes: readonly InventorySchemaIndex[];
  readonly foreignKeys: readonly SpanFields<SchemaTableForeignKey>[];
}

export interface InventorySchemaProjectedCatalog {
  readonly sources: InventorySchemaIdentityCatalog["sources"];
  readonly fact: SchemaFact<{ readonly tables: readonly InventorySchemaProjectedTable[] }>;
}

/** Existing identity validation owns source rosters/statuses; this refinement owns complete nested data. */
export function schemaProjectionInventorySchema(
  span: z.ZodType<InventorySpan>,
  identityCatalog: z.ZodType<InventorySchemaIdentityCatalog>,
): z.ZodType<InventorySchemaProjectedCatalog> {
  const tableIdentity = z.object({ sourcePath: z.string(), declarationName: z.string(), key: z.string() });
  const columnIdentity = z.object({ table: tableIdentity, propertyName: z.string(), key: z.string() });
  const onDelete = z.discriminatedUnion("kind", [z.object({ kind: z.literal("specified"), value: z.string() }), z.object({ kind: z.literal("unspecified") })]);
  const parent = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("population-column"), column: columnIdentity }),
    z.object({
      kind: z.literal("external-column"),
      sourcePath: z.string(),
      moduleSpecifier: z.string(),
      exportedTable: z.string(),
      propertyName: z.string(),
      key: z.string(),
    }),
  ]);
  const call = span.refine((value) => value.kind === SyntaxKind.CallExpression);
  const shape = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("open"), typeNode: span.nullable() }),
    z.object({ kind: z.literal("closed"), keys: z.array(z.string()), typeNode: span }),
    z.object({ kind: z.literal("scalar"), typeNode: span }),
  ]);
  const column = z.object({
    identity: columnIdentity,
    declaration: span,
    expression: span,
    defaultOperations: z.array(z.enum(SCHEMA_COLUMN_DEFAULT_OPERATIONS)),
    sqlName: z.string(),
    builder: z.object({ moduleSpecifier: z.string(), exportedName: z.string(), call }),
    typeOverride: z.object({ node: span, display: z.string(), idBrand: z.string().nullable() }).strict().nullable(),
    primaryKey: z.boolean(),
    unique: z.boolean(),
    notNull: z.boolean(),
    json: z.object({ mode: z.literal("json"), shape }).nullable(),
    foreignKey: z.object({ child: columnIdentity, parent, onDelete, call }).nullable(),
  });
  const term = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("column"), column: columnIdentity }),
    z.object({ kind: z.literal("expression"), node: span }),
  ]);
  const table = z.object({
    columns: z.array(column),
    indexes: z.array(
      z.object({
        kind: z.enum(["index", "unique-index", "primary-key"]),
        name: z.discriminatedUnion("kind", [z.object({ kind: z.literal("named"), value: z.string() }), z.object({ kind: z.literal("unnamed") })]),
        terms: z.array(term),
        columns: z.array(columnIdentity),
        call,
      }),
    ),
    foreignKeys: z.array(z.object({ children: z.array(columnIdentity).min(1), parents: z.array(parent).min(1), onDelete, call })),
  });
  return z
    .intersection(
      identityCatalog,
      z.object({
        fact: z.discriminatedUnion("status", [
          z.object({ status: z.literal("ready"), value: z.object({ tables: z.array(table) }) }),
          z.object({ status: z.enum(SCHEMA_FACT_STATUSES).exclude(["ready"]) }),
        ]),
      }),
    )
    .transform((catalog): InventorySchemaProjectedCatalog => {
      const { fact } = catalog;
      return {
        sources: catalog.sources,
        fact:
          fact.status === "ready"
            ? {
                ...fact,
                value: {
                  tables: Array.from({ length: fact.value.tables.length }, (_, index) => {
                    const captured = fact.value.tables[index];
                    if (captured === undefined) {
                      throw new Error("native schema projection table data is missing");
                    }
                    return { ...captured };
                  }),
                },
              }
            : fact,
      };
    })
    .superRefine((catalog, context) => {
      try {
        assertSchemaProjectedCatalog(catalog);
      } catch (error) {
        context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
      }
    });
}

/** A valid outer table list cannot license missing column, constraint or JSON evidence. */
export function assertSchemaProjectedCatalog(catalog: InventorySchemaProjectedCatalog): void {
  assertSchemaIdentityCatalog(catalog);
  const { fact } = catalog;
  if (fact.status !== "ready") {
    return;
  }
  const tables = fact.value.tables;
  const columns = tables.flatMap((table) => table.columns);
  const indexes = tables.flatMap((table) => table.indexes);
  const json = columns.filter((column) => column.json !== null);
  if (
    columns.length !== fact.receipt.columns ||
    indexes.length !== fact.receipt.indexes ||
    json.length !== fact.receipt.jsonColumns ||
    json.filter((column) => column.json?.shape.kind === "open").length !== fact.receipt.openJsonColumns ||
    columns.filter((column) => column.foreignKey !== null).length + tables.flatMap((table) => table.foreignKeys).length !== fact.receipt.foreignKeys
  ) {
    throw new Error("native schema projection nested census is incomplete");
  }
  const byKey = new Map(columns.map((column) => [column.identity.key, column.identity]));
  if (byKey.size !== columns.length) {
    throw new Error("native schema projection column identities are ambiguous");
  }
  for (const table of tables) {
    assertColumns(table, byKey);
    assertConstraints(table, byKey);
  }
}

function assertColumns(table: InventorySchemaProjectedTable, byKey: ReadonlyMap<string, SchemaProjectedColumn["identity"]>): void {
  for (const column of table.columns) {
    if (
      JSON.stringify(column.identity.table) !== JSON.stringify(table.identity) ||
      column.identity.key !== `${table.identity.key}.${column.identity.propertyName}`
    ) {
      throw new Error("native schema projection column belongs to a foreign table");
    }
    const foreignKey = column.foreignKey;
    if (foreignKey !== null && (JSON.stringify(foreignKey.child) !== JSON.stringify(column.identity) || !knownParent(foreignKey.parent, byKey))) {
      throw new Error("native schema projection inline foreign key is incomplete");
    }
  }
}

function assertConstraints(table: InventorySchemaProjectedTable, byKey: ReadonlyMap<string, SchemaProjectedColumn["identity"]>): void {
  for (const index of table.indexes) {
    const terms = index.terms.flatMap((term) => (term.kind === "column" ? [term.column] : []));
    if (
      JSON.stringify(index.columns) !== JSON.stringify(terms) ||
      terms.some((column) => column.table.key !== table.identity.key || JSON.stringify(byKey.get(column.key)) !== JSON.stringify(column))
    ) {
      throw new Error("native schema projection index terms are incomplete");
    }
  }
  for (const foreignKey of table.foreignKeys) {
    if (
      foreignKey.children.length === 0 ||
      foreignKey.children.length !== foreignKey.parents.length ||
      foreignKey.children.some((column) => column.table.key !== table.identity.key || JSON.stringify(byKey.get(column.key)) !== JSON.stringify(column)) ||
      foreignKey.parents.some((parent) => !knownParent(parent, byKey))
    ) {
      throw new Error("native schema projection composite foreign key is incomplete");
    }
  }
}

function knownParent(parent: SchemaForeignKey["parent"], columns: ReadonlyMap<string, SchemaProjectedColumn["identity"]>): boolean {
  return parent.kind === "population-column"
    ? JSON.stringify(columns.get(parent.column.key)) === JSON.stringify(parent.column)
    : parent.key === `${parent.sourcePath}#${parent.exportedTable}.${parent.propertyName}`;
}
