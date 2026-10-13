import type { DrizzleValueContext } from "../../floor/code-facts/drizzle-origin-contract.ts";
import type { SchemaColumn, SchemaTable } from "./schema-fact.ts";

export type { JsonColumnOrigin, JsonNormalizerProof } from "../../floor/code-facts/drizzle-origin-contract.ts";

export interface JsonColumnOriginContext extends DrizzleValueContext {
  readonly mergeActive: ReadonlySet<object>;
}

export interface JsonColumnMergeProof {
  readonly keywise: boolean;
  readonly historicalHeal: boolean;
}

export interface JsonColumnTarget {
  readonly table: SchemaTable;
  readonly column: SchemaColumn;
}
