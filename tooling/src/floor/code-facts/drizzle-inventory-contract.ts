// Wire projections retain native source identities and facts, never compiler objects or ownership judgments.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { z } from "zod";
import type { DrizzleEvidenceQuery, InstanceMethodIdentity } from "./drizzle-evidence-contract.ts";
import { DRIZZLE_EVIDENCE_MODES } from "./drizzle-evidence-contract.ts";
import type { DrizzleTableRef } from "./drizzle-table-ref.ts";
import type { CalledMember } from "./drizzle-write-chain-contract.ts";
import type { SchemaIdentityModel, SchemaIdentityTable } from "./schema-identity-contract.ts";
import type { SchemaFact } from "./schema-model-contract.ts";
import { SCHEMA_FACT_STATUSES } from "./schema-model-contract.ts";
import type { InventoryInput, InventoryInvocationReference, InventorySpan } from "./semantic-inventory-contract.ts";

type SpanFields<Value> = { readonly [Key in keyof Value]: Value[Key] extends Node ? InventorySpan : Value[Key] };

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

export type InventoryDrizzleCallEvidence =
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
  readonly basis: InventorySchemaBasis;
  readonly evidence: InventoryDrizzleCallEvidence;
}

export type InventoryDrizzleQuery = InventoryDrizzleCall["query"];

/** Validators share the inventory's span/reference vocabulary without a runtime module cycle. */
export function drizzleInventorySchemas(
  span: z.ZodType<InventorySpan>,
  reference: <Value>(value: z.ZodType<Value>) => z.ZodType<InventoryInvocationReference<Value>>,
  invocation: z.ZodType<InstanceMethodIdentity["invocation"]>,
): { readonly catalog: z.ZodType<InventorySchemaIdentityCatalog>; readonly call: z.ZodType<InventoryDrizzleCall> } {
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
  const evidence = z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("called-member"), member: reference(member), table: reference(z.string()).nullable() }),
    z.object({
      mode: z.literal("instance"),
      invocation: reference(instance),
      table: z
        .object({ node: span, stability: z.array(z.object({ node: span, fact: reference(span) })).min(1), references: z.array(tableReference).min(1) })
        .nullable(),
    }),
  ]);
  const call: z.ZodType<InventoryDrizzleCall> = z
    .object({
      query: z.object({ node: span.refine((node) => node.kind === SyntaxKind.CallExpression), mode: z.enum(DRIZZLE_EVIDENCE_MODES) }),
      basis: z.object({ program: z.string(), partition: z.string() }),
      evidence,
    })
    .refine((value) => value.query.mode === value.evidence.mode, "native Drizzle query projection disagrees with captured evidence");
  return { catalog, call };
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
