// Complete schema data without live compiler Types; type relations retain their native owner.
import { z } from "zod";
import type { SchemaConfiguration } from "./schema-configuration-contract.ts";
import type { SchemaColumn, SchemaColumnTypeOverride, SchemaModel, SchemaTable } from "./schema-model-contract.ts";
import type { NativeTypeVocabulary } from "./type-projection-contract.ts";

export const schemaDataProjectionSchema = z.strictObject({ typeVocabulary: z.literal(true).optional(), builderConfig: z.literal(true).optional() });
export type SchemaDataProjection = z.infer<typeof schemaDataProjectionSchema>;

export interface SchemaProjectedTypeOverride extends Omit<SchemaColumnTypeOverride, "type"> {
  readonly vocabulary?: NativeTypeVocabulary | undefined;
}

export interface SchemaProjectedColumn extends Omit<SchemaColumn, "typeOverride"> {
  readonly typeOverride: SchemaProjectedTypeOverride | null;
  readonly configuration?: SchemaConfiguration | null | undefined;
}

export interface SchemaProjectedTable extends Omit<SchemaTable, "columns"> {
  readonly columns: readonly SchemaProjectedColumn[];
}

export interface SchemaProjectedModel extends Omit<SchemaModel, "tables"> {
  readonly tables: readonly SchemaProjectedTable[];
}
