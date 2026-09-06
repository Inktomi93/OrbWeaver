// Closed Drizzle schema facts. Missing, empty, and unresolved are verdicts, never `undefined`.
import type { CallExpression, Node, SourceFile, TypeChecker, VariableDeclaration } from "ts-morph";
import type { GatePolicyContext } from "./policy.ts";
import type { ReferenceFact } from "./reference-fact.ts";

export const SCHEMA_FACT_STATUSES = ["ready", "missing", "empty", "unresolved"] as const;
export type SchemaFactStatus = (typeof SCHEMA_FACT_STATUSES)[number];

export interface SchemaFactReceipt {
  readonly source: "drizzle-schema";
  readonly status: SchemaFactStatus;
  readonly paths: readonly string[];
  readonly members: number;
  readonly tables: number;
  readonly columns: number;
  readonly foreignKeys: number;
  readonly indexes: number;
  readonly jsonColumns: number;
  readonly openJsonColumns: number;
}

export type SchemaFact<T> =
  | { readonly status: "ready"; readonly value: T; readonly receipt: SchemaFactReceipt }
  | { readonly status: "missing" | "empty" | "unresolved"; readonly reason: string; readonly receipt: SchemaFactReceipt };

export type ReadySchemaFact<T> = Extract<SchemaFact<T>, { readonly status: "ready" }>;

/** Consumer-side proof that the shared schema denominator was complete before a policy judged it. */
export function recordReadySchemaFact<T>(context: GatePolicyContext, fact: SchemaFact<T>): asserts fact is ReadySchemaFact<T> {
  if (fact.status !== "ready") {
    throw new Error(`drizzle schema fact ${fact.status}: ${fact.reason}`);
  }
  context.receipt({ kind: "population", source: fact.receipt.source, members: fact.receipt.members });
}

export interface SchemaTableIdentity {
  readonly sourcePath: string;
  readonly declarationName: string;
  readonly key: string;
}

export interface SchemaColumnIdentity {
  readonly table: SchemaTableIdentity;
  readonly propertyName: string;
  readonly key: string;
}

export interface SchemaColumnBuilder {
  readonly moduleSpecifier: string;
  readonly exportedName: string;
  readonly call: CallExpression;
}

export type SchemaJsonShape =
  | { readonly kind: "open"; readonly typeNode: Node | null }
  | { readonly kind: "closed"; readonly keys: readonly string[]; readonly typeNode: Node }
  | { readonly kind: "scalar"; readonly typeNode: Node };

export interface SchemaJsonColumn {
  readonly mode: "json";
  readonly shape: SchemaJsonShape;
}

export interface SchemaForeignKey {
  readonly child: SchemaColumnIdentity;
  readonly parent:
    | { readonly kind: "population-column"; readonly column: SchemaColumnIdentity }
    | {
        readonly kind: "external-column";
        readonly sourcePath: string;
        readonly moduleSpecifier: string;
        readonly exportedTable: string;
        readonly propertyName: string;
        readonly key: string;
      };
  readonly onDelete: { readonly kind: "specified"; readonly value: string } | { readonly kind: "unspecified" };
  readonly call: CallExpression;
}

export interface SchemaColumn {
  readonly identity: SchemaColumnIdentity;
  readonly declaration: Node;
  readonly expression: Node;
  readonly sqlName: string;
  readonly builder: SchemaColumnBuilder;
  readonly primaryKey: boolean;
  readonly unique: boolean;
  readonly notNull: boolean;
  readonly json: SchemaJsonColumn | null;
  readonly foreignKey: SchemaForeignKey | null;
}

export interface SchemaIndex {
  readonly kind: "index" | "unique-index" | "primary-key";
  readonly name: { readonly kind: "named"; readonly value: string } | { readonly kind: "unnamed" };
  readonly terms: readonly ({ readonly kind: "column"; readonly column: SchemaColumnIdentity } | { readonly kind: "expression"; readonly node: Node })[];
  readonly columns: readonly SchemaColumnIdentity[];
  readonly call: CallExpression;
}

export interface SchemaTable {
  readonly identity: SchemaTableIdentity;
  readonly declaration: VariableDeclaration;
  readonly call: CallExpression;
  readonly sqlName: string;
  readonly columns: readonly SchemaColumn[];
  readonly indexes: readonly SchemaIndex[];
}

export interface SchemaModel {
  readonly tables: readonly SchemaTable[];
}

export interface SchemaQueryOptions {
  readonly files: readonly SourceFile[];
  readonly relativePath: (sourceFile: SourceFile) => string;
  readonly checker: () => TypeChecker;
}

export interface SchemaQuery {
  readonly schema: () => SchemaFact<SchemaModel>;
  readonly table: (node: Node) => ReferenceFact<SchemaTable>;
  readonly column: (node: Node) => ReferenceFact<SchemaColumn>;
}
