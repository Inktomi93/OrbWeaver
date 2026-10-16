// Type-free projections retain the complete schema extractor's status and census, not a partial SchemaModel.
import type { Node } from "ts-morph";
import type { DrizzleTableRef } from "./drizzle-table-ref.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { SchemaColumnIdentity, SchemaFact, SchemaTable } from "./schema-model-contract.ts";

export type SchemaIdentityTable = Pick<SchemaTable, "identity" | "declaration" | "call" | "sqlName">;

export interface SchemaIdentityModel<Table = SchemaIdentityTable> {
  readonly tables: readonly Table[];
}

export interface SchemaIdentityQuery<Table = SchemaIdentityTable> {
  readonly schema: () => SchemaFact<SchemaIdentityModel<Table>>;
  readonly declarations: ReadonlySet<string>;
  readonly table: (node: Node) => ReferenceFact<Table>;
  readonly column: (node: Node) => ReferenceFact<SchemaColumnIdentity>;
}

/** Preserve every stability observation the canonical table resolver asks its declaration predicate to visit. */
export interface DrizzleTableEvidence {
  readonly node: Node;
  readonly stability: readonly { readonly node: Node; readonly fact: ReferenceFact<Node> }[];
  readonly references: readonly DrizzleTableRef[];
}
