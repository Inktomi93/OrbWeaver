// Wire projections retain native source identities and facts, never compiler objects or ownership judgments.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { z } from "zod";
import type { DrizzleEvidenceQuery, InstanceMethodIdentity } from "./drizzle-evidence-contract.ts";
import { DRIZZLE_EVIDENCE_MODES } from "./drizzle-evidence-contract.ts";
import type { DrizzleTableRef } from "./drizzle-table-ref.ts";
import type { CalledMember } from "./drizzle-write-chain-contract.ts";
import type { SchemaIdentityModel, SchemaIdentityTable } from "./schema-identity-contract.ts";
import type { SchemaColumnIdentity, SchemaFact } from "./schema-model-contract.ts";
import { SCHEMA_FACT_STATUSES } from "./schema-model-contract.ts";
import type { InventorySchemaProjectedCatalog } from "./schema-projection-inventory-contract.ts";
import type { InventoryInput, InventoryInvocationReference, InventorySpan } from "./semantic-inventory-contract.ts";

type SpanFields<Value> = { readonly [Key in keyof Value]: Value[Key] extends Node ? InventorySpan : Value[Key] };

export const SCHEMA_IDENTITY_CATALOG_KEY = "catalog";
export const SCHEMA_DATA_CATALOG_KEY = "full-catalog";

export type InventorySchemaIdentityTable = SpanFields<SchemaIdentityTable>;

export interface InventorySchemaIdentityCatalog {
  readonly sources: readonly { readonly node: InventorySpan; readonly path: string; readonly version: string }[];
  readonly fact: SchemaFact<SchemaIdentityModel<InventorySchemaIdentityTable>>;
}

export interface InventorySchemaBasis {
  readonly program: string;
  readonly partition: string;
}

/** Passed within the existing writer transaction; no separately published catalog generation is admitted. */
export interface InventorySchemaDependency extends InventorySchemaBasis {
  readonly descriptorVersion: string;
  readonly inputs: readonly InventoryInput[];
  readonly catalog: InventorySchemaIdentityCatalog;
  readonly columns?: readonly SchemaColumnIdentity[];
}

type InventoryCalledMember = SpanFields<Omit<CalledMember, "declarations">> & { readonly declarations: readonly InventorySpan[] };
type InventoryInstanceMember = SpanFields<Omit<InstanceMethodIdentity["target"]["member"], "declarations">> & {
  readonly declarations: readonly InventorySpan[];
};

export interface InventoryInstanceMethodIdentity {
  readonly invocation: InstanceMethodIdentity["invocation"];
  readonly target: { readonly member: InventoryInstanceMember };
  readonly callee: InventorySpan;
  readonly captureDeclarations: readonly InventorySpan[];
  readonly arguments: InventoryInvocationReference<readonly InventorySpan[]>;
}

export type InventoryDrizzleTableReference = SpanFields<DrizzleTableRef>;

export interface InventoryDrizzleTableEvidence {
  readonly node: InventorySpan;
  readonly stability: readonly { readonly node: InventorySpan; readonly fact: InventoryInvocationReference<InventorySpan> }[];
  readonly references: readonly InventoryDrizzleTableReference[];
}

export interface InventoryDrizzleValueSourceEvidence {
  readonly source: InventoryInvocationReference<{
    readonly members: readonly { readonly name: string; readonly receiver: InventorySpan; readonly nameNode: InventorySpan; readonly access: InventorySpan }[];
    readonly subselects: readonly InventorySpan[];
  }>;
  readonly tables: readonly InventoryDrizzleTableEvidence[];
}

export type InventoryDrizzleCallEvidence =
  | { readonly mode: "column"; readonly column: InventoryInvocationReference<string> }
  | {
      readonly mode: "called-member";
      readonly member: InventoryInvocationReference<InventoryCalledMember>;
      readonly table: InventoryInvocationReference<string> | null;
    }
  | {
      readonly mode: "instance";
      readonly invocation: InventoryInvocationReference<InventoryInstanceMethodIdentity>;
      readonly table: InventoryDrizzleTableEvidence | null;
    };

export interface InventoryDrizzleCall {
  readonly query: SpanFields<DrizzleEvidenceQuery>;
  readonly basis: InventorySchemaBasis | null;
  readonly evidence: InventoryDrizzleCallEvidence;
}

export type InventoryDrizzleQuery = InventoryDrizzleCall["query"];

/** Validators share the inventory's span/reference vocabulary without a runtime module cycle. */
export function drizzleInventorySchemas(
  span: z.ZodType<InventorySpan>,
  reference: <Value>(value: z.ZodType<Value>) => z.ZodType<InventoryInvocationReference<Value>>,
  invocation: z.ZodType<InstanceMethodIdentity["invocation"]>,
): {
  readonly catalog: z.ZodType<InventorySchemaIdentityCatalog>;
  readonly call: z.ZodType<InventoryDrizzleCall>;
  readonly valueSources: z.ZodType<InventoryDrizzleValueSourceEvidence>;
} {
  const identity = z.object({ sourcePath: z.string(), declarationName: z.string(), key: z.string() });
  const table = z.object({
    identity,
    declaration: span.refine((node) => node.kind === SyntaxKind.VariableDeclaration),
    call: span.refine((node) => node.kind === SyntaxKind.CallExpression),
    sqlName: z.string(),
  });
  const receipt = z.object({
    source: z.literal("drizzle-schema"),
    status: z.enum(SCHEMA_FACT_STATUSES),
    paths: z.array(z.string()),
    members: z.number().int().nonnegative(),
    tables: z.number().int().nonnegative(),
    columns: z.number().int().nonnegative(),
    foreignKeys: z.number().int().nonnegative(),
    indexes: z.number().int().nonnegative(),
    jsonColumns: z.number().int().nonnegative(),
    openJsonColumns: z.number().int().nonnegative(),
  });
  const catalog: z.ZodType<InventorySchemaIdentityCatalog> = z
    .object({
      sources: z.array(z.object({ node: span.refine((node) => node.kind === SyntaxKind.SourceFile), path: z.string(), version: z.string() })),
      fact: z.discriminatedUnion("status", [
        z.object({ status: z.literal("ready"), value: z.object({ tables: z.array(table) }), receipt }),
        z.object({ status: z.enum(SCHEMA_FACT_STATUSES).exclude(["ready"]), reason: z.string(), receipt }),
      ]),
    })
    .superRefine((value, context) => {
      try {
        assertSchemaIdentityCatalog(value);
      } catch (error) {
        context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
      }
    });
  const member = z.object({ name: z.string(), nameNode: span, declarations: z.array(span) });
  const instance = z.object({
    invocation,
    callee: span,
    captureDeclarations: z.array(span),
    arguments: reference(z.array(span)),
    target: z.object({ member: member.extend({ access: span, receiver: span, declarations: z.array(span).min(1) }) }),
  });
  const tableReference = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("table"), declaration: span }),
    z.object({ kind: z.literal("imported"), name: z.string() }),
    z.object({ kind: z.literal("sql-name"), sqlName: z.string() }),
    z.object({ kind: z.literal("subquery"), select: span }),
    z.object({ kind: z.literal("raw-sql"), text: z.string(), interpolates: z.boolean() }),
    z.object({ kind: z.literal("unresolved"), node: span }),
  ]);
  const tableEvidence = z.object({
    node: span,
    stability: z.array(z.object({ node: span, fact: reference(span) })).min(1),
    references: z.array(tableReference).min(1),
  });
  const valueSources: z.ZodType<InventoryDrizzleValueSourceEvidence> = z
    .strictObject({
      source: reference(
        z.strictObject({
          members: z.array(z.strictObject({ name: z.string(), receiver: span, nameNode: span, access: span })),
          subselects: z.array(span),
        }),
      ),
      tables: z.array(tableEvidence),
    })
    .superRefine((value, context) => {
      const key = (node: InventorySpan): string => JSON.stringify([node.file, node.start, node.end, node.kind]);
      const receivers = new Set(value.source.kind === "resolved" ? value.source.value.members.map((read) => key(read.receiver)) : []);
      if (
        value.tables.length !== receivers.size ||
        new Set(value.tables.map((row) => key(row.node))).size !== value.tables.length ||
        value.tables.some((row) => !receivers.has(key(row.node)) || key(row.stability[0]?.node ?? row.node) !== key(row.node))
      ) {
        context.addIssue({ code: "custom", message: "native value-source receiver table evidence is missing or foreign" });
      }
    });
  const evidence = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("column"), column: reference(z.string()) }),
    z.object({ mode: z.literal("called-member"), member: reference(member), table: reference(z.string()).nullable() }),
    z.object({
      mode: z.literal("instance"),
      invocation: reference(instance),
      table: tableEvidence.nullable(),
    }),
  ]);
  const call: z.ZodType<InventoryDrizzleCall> = z
    .object({
      query: z
        .object({ node: span, mode: z.enum(DRIZZLE_EVIDENCE_MODES) })
        .refine((query) => query.mode === "column" || query.node.kind === SyntaxKind.CallExpression, "native Drizzle call query is not a CallExpression"),
      basis: z.object({ program: z.string(), partition: z.string() }).nullable(),
      evidence,
    })
    .refine((value) => value.query.mode === value.evidence.mode, "native Drizzle query projection disagrees with captured evidence")
    .refine((value) => value.basis !== null || value.query.mode === "column", "only native column evidence may use its own catalog partition");
  return { catalog, call, valueSources };
}

/** Column references require the complete roster from the same full/identity catalog generation. */
export function assertSchemaColumnRoster(catalog: InventorySchemaIdentityCatalog, columns: readonly SchemaColumnIdentity[]): void {
  const tables = new Map((catalog.fact.status === "ready" ? catalog.fact.value.tables : []).map((table) => [table.identity.key, table.identity]));
  if (
    columns.length !== catalog.fact.receipt.columns ||
    new Set(columns.map(({ key }) => key)).size !== columns.length ||
    columns.some(
      (column) => column.key !== `${column.table.key}.${column.propertyName}` || JSON.stringify(tables.get(column.table.key)) !== JSON.stringify(column.table),
    )
  ) {
    throw new Error("native Drizzle column catalog is incomplete or foreign");
  }
}

/** Full and identity data must describe one complete atomic schema population before keys can cross worlds. */
export function schemaCatalogColumns(identity: InventorySchemaIdentityCatalog, full: InventorySchemaProjectedCatalog): readonly SchemaColumnIdentity[] {
  if (JSON.stringify(full.sources) !== JSON.stringify(identity.sources) || JSON.stringify(full.fact.receipt) !== JSON.stringify(identity.fact.receipt)) {
    throw new Error("native Drizzle full and identity catalog rosters disagree");
  }
  const columns = full.fact.status === "ready" ? full.fact.value.tables.flatMap((table) => table.columns.map((column) => column.identity)) : [];
  assertSchemaColumnRoster(identity, columns);
  return columns;
}

/** Missing roster/table metadata cannot be interpreted as recorded empty schema evidence. */
export function assertSchemaIdentityCatalog(catalog: InventorySchemaIdentityCatalog): void {
  const { sources, fact } = catalog;
  const paths = sources.map((source) => source.path).toSorted();
  const files = new Set(sources.map((source) => source.node.file));
  if (files.size !== sources.length || new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify(fact.receipt.paths)) {
    throw new Error("native schema identity roster coverage is incomplete");
  }
  const receipt = fact.receipt;
  const counts = [receipt.tables, receipt.columns, receipt.foreignKeys, receipt.indexes, receipt.jsonColumns, receipt.openJsonColumns, receipt.members];
  if (
    receipt.status !== fact.status ||
    !counts.every((count) => Number.isInteger(count) && count >= 0) ||
    receipt.members !== receipt.tables + receipt.columns + receipt.foreignKeys + receipt.indexes ||
    receipt.openJsonColumns > receipt.jsonColumns ||
    receipt.jsonColumns > receipt.columns
  ) {
    throw new Error("native schema identity census is incomplete");
  }
  if (fact.status !== "ready") {
    if (counts.some((count) => count !== 0) || (sources.length === 0) !== (fact.status === "missing")) {
      throw new Error("native schema identity unavailable census is inconsistent");
    }
    return;
  }
  if (fact.value.tables.length === 0 || fact.value.tables.length !== receipt.tables) {
    throw new Error("native schema identity table coverage is incomplete");
  }
  const identities = new Set<string>();
  for (const table of fact.value.tables) {
    const source = sources.find((entry) => entry.node.file === table.declaration.file);
    if (
      source === undefined ||
      source.path !== table.identity.sourcePath ||
      table.identity.key !== `${table.identity.sourcePath}#${table.identity.declarationName}` ||
      identities.has(table.identity.key)
    ) {
      throw new Error("native schema identity table has foreign or ambiguous source ownership");
    }
    identities.add(table.identity.key);
  }
}
