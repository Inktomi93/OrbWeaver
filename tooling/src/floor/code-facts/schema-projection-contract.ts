// Complete schema data without live compiler Types; type relations retain their native owner.
import type { SchemaColumn, SchemaColumnTypeOverride, SchemaModel, SchemaTable } from "./schema-model-contract.ts";

export type SchemaProjectedTypeOverride = Omit<SchemaColumnTypeOverride, "type">;

export interface SchemaProjectedColumn extends Omit<SchemaColumn, "typeOverride"> {
  readonly typeOverride: SchemaProjectedTypeOverride | null;
}

export interface SchemaProjectedTable extends Omit<SchemaTable, "columns"> {
  readonly columns: readonly SchemaProjectedColumn[];
}

export interface SchemaProjectedModel extends Omit<SchemaModel, "tables"> {
  readonly tables: readonly SchemaProjectedTable[];
}
