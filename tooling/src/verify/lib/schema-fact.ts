// Invocation-scoped Drizzle schema query built only from the policy's already-loaded source population.
// Reference resolution inside that population — tables, columns, foreign keys and indexes — is
// `schema-fact-resolve.ts` (split out at the size cap 2026-09-18); discovery, the receipt, the query and the
// fact stay here.

import { resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import type { UnresolvedReferenceFact } from "@orb/tooling/_shared/reference-fact-contract";
import type { CallExpression, Node as MorphNode, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { SchemaFact, SchemaFactReceipt, SchemaModel, SchemaQuery, SchemaQueryOptions, SchemaTable } from "../contract/schema-fact.ts";
import { columnFromReference, foreignKeyOf, indexesOf, tableFromReference } from "./schema-fact-resolve.ts";
import {
  canonicalPathResolver,
  DRIZZLE_SQLITE,
  exactDrizzleExport,
  refuse,
  SchemaRefusal,
  SQLITE_TABLE,
  schemaDeclarationKey,
  tableDraft,
  terminalCall,
  unresolved,
  unwrapSchemaExpression,
} from "./schema-fact-value.ts";

function schemaTableCall(declaration: VariableDeclaration, sourceFile: SourceFile): CallExpression | null {
  if (declaration.getVariableStatement()?.getParent() !== sourceFile) {
    return null;
  }
  const initializer = declaration.getInitializer();
  const authoredCall = initializer === undefined ? undefined : unwrapSchemaExpression(initializer);
  if (!Node.isCallExpression(authoredCall)) {
    return null;
  }
  const call = terminalCall(authoredCall);
  if (call.kind === "unresolved") {
    if (authoredSqliteTableDoor(authoredCall.getExpression(), new Set())) {
      refuse({ ...call, detail: `Drizzle table ${declaration.getName()} call is unresolved: ${call.detail}` });
    }
    return null;
  }
  const target = exactDrizzleExport(call.value, SQLITE_TABLE);
  if (target.kind === "resolved") {
    return call.value;
  }
  return authoredSqliteTableDoor(call.value.getExpression(), new Set())
    ? refuse({ ...target, detail: `Drizzle table ${declaration.getName()} call is unresolved: ${target.detail}` })
    : null;
}

function schemaTableCalls(files: readonly SourceFile[]): readonly { readonly declaration: VariableDeclaration; readonly call: CallExpression }[] {
  return files.flatMap((sourceFile) =>
    sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).flatMap((declaration) => {
      const call = schemaTableCall(declaration, sourceFile);
      return call === null ? [] : [{ declaration, call }];
    }),
  );
}

function authoredSqliteTableDoor(node: MorphNode, visited: Set<object>): boolean {
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "resolved") {
    const canonical = origin.value.canonical;
    const moduleSpecifier = canonical.kind === "external-door" ? canonical.moduleSpecifier : origin.value.moduleSpecifier;
    return moduleSpecifier === DRIZZLE_SQLITE && canonical.exportedName === SQLITE_TABLE;
  }
  if (!Node.isIdentifier(node)) {
    return false;
  }
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  return declarations.some((declaration) => {
    if (visited.has(declaration.compilerNode)) {
      return false;
    }
    visited.add(declaration.compilerNode);
    const initializer = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
    return initializer !== undefined && authoredSqliteTableDoor(initializer, visited);
  });
}

function receipt(status: SchemaFactReceipt["status"], paths: readonly string[], tables: readonly SchemaTable[]): SchemaFactReceipt {
  const columns = tables.flatMap((table) => table.columns);
  const indexes = tables.flatMap((table) => table.indexes);
  const foreignKeys = columns.filter((column) => column.foreignKey !== null);
  const json = columns.filter((column) => column.json !== null);
  const open = json.filter((column) => column.json?.shape.kind === "open");
  return {
    source: "drizzle-schema",
    status,
    paths,
    members: tables.length + columns.length + foreignKeys.length + indexes.length,
    tables: tables.length,
    columns: columns.length,
    foreignKeys: foreignKeys.length,
    indexes: indexes.length,
    jsonColumns: json.length,
    openJsonColumns: open.length,
  };
}

function buildSchema(
  options: SchemaQueryOptions,
  paths: readonly string[],
  canonicalPath: (sourceFile: SourceFile) => string,
  calls: readonly { readonly declaration: VariableDeclaration; readonly call: CallExpression }[],
): SchemaFact<SchemaModel> {
  const unsupported = paths.find((path) => !(path.endsWith(".ts") || path.endsWith(".tsx")));
  if (unsupported !== undefined) {
    return {
      status: "unresolved",
      reason: `schema source population contains unsupported non-TS path: ${unsupported}`,
      receipt: receipt("unresolved", paths, []),
    };
  }
  if (options.files.length === 0) {
    return { status: "missing", reason: "schema source population is missing", receipt: receipt("missing", paths, []) };
  }
  // @orb-waive caught-failure-ownership(error): drizzle schema parse error: surfaced as a structured tool-error in the schema-fact report; the broken schema is excluded from the fact census
  try {
    if (calls.length === 0) {
      return { status: "empty", reason: "schema source population declares no Drizzle SQLite tables", receipt: receipt("empty", paths, []) };
    }
    const drafts = calls.map(({ declaration, call }) => tableDraft(declaration, call, options));
    const initialTables: SchemaTable[] = drafts.map((table) => ({
      ...table,
      columns: table.columns.map(({ operations: _operations, ...column }) => ({ ...column, foreignKey: null })),
      indexes: [],
    }));
    const tableByDeclaration = new Map(initialTables.map((table) => [schemaDeclarationKey(table.declaration), table]));
    const initialColumns = new Map(initialTables.flatMap((table) => table.columns.map((column) => [column.identity.key, column] as const)));
    const tables = drafts.map((draft) => {
      const columns = draft.columns.map(({ operations: _operations, ...column }) => ({
        ...column,
        foreignKey: foreignKeyOf({ ...column, operations: _operations }, tableByDeclaration, initialColumns, canonicalPath),
      }));
      return { identity: draft.identity, declaration: draft.declaration, call: draft.call, sqlName: draft.sqlName, columns, indexes: indexesOf(draft) };
    });
    const value = { tables: tables.toSorted((left, right) => left.identity.key.localeCompare(right.identity.key)) } satisfies SchemaModel;
    return { status: "ready", value, receipt: receipt("ready", paths, value.tables) };
  } catch (error) {
    let reason: string;
    if (error instanceof SchemaRefusal) {
      reason = error.fact.detail;
    } else {
      reason = error instanceof Error ? error.message : String(error);
    }
    return { status: "unresolved", reason, receipt: receipt("unresolved", paths, []) };
  }
}

function queryForSchema(schema: SchemaFact<SchemaModel>): SchemaQuery {
  const tables = schema.status === "ready" ? schema.value.tables : [];
  const byDeclaration = new Map(tables.map((table) => [schemaDeclarationKey(table.declaration), table]));
  const byColumn = new Map(tables.flatMap((table) => table.columns.map((column) => [column.identity.key, column] as const)));
  const unavailable = (node: MorphNode): UnresolvedReferenceFact =>
    unresolved(
      schema.status === "unresolved" ? "unsupported" : "missing",
      node,
      `schema query is ${schema.status}: ${"reason" in schema ? schema.reason : "not ready"}`,
    );
  return Object.freeze({
    schema: () => schema,
    table: (node: MorphNode) => (schema.status === "ready" ? tableFromReference(node, byDeclaration) : unavailable(node)),
    column: (node: MorphNode) => (schema.status === "ready" ? columnFromReference(node, byDeclaration, byColumn) : unavailable(node)),
  });
}

function unresolvedDiscovery(options: SchemaQueryOptions, error: unknown): SchemaQuery {
  const paths = [...new Set(options.files.map(options.relativePath))].toSorted();
  let reason: string;
  if (error instanceof SchemaRefusal) {
    reason = error.fact.detail;
  } else if (error instanceof Error) {
    reason = error.message;
  } else {
    reason = String(error);
  }
  return queryForSchema({ status: "unresolved", reason, receipt: receipt("unresolved", paths, []) });
}

function queryForCalls(
  options: SchemaQueryOptions,
  calls: readonly { readonly declaration: VariableDeclaration; readonly call: CallExpression }[],
): SchemaQuery {
  const paths = [...new Set(options.files.map(options.relativePath))].toSorted();
  return queryForSchema(buildSchema(options, paths, canonicalPathResolver(options), calls));
}

/** Direct test/query helper. Production policies consume `drizzleSchemaFact` through the shared dispatcher. */
export function createSchemaQuery(options: SchemaQueryOptions): SchemaQuery {
  // @orb-waive caught-failure-ownership(error): drizzle column parse error: surfaced as a structured tool-error in the schema-fact report; the broken column is excluded from the fact census
  try {
    return queryForCalls(options, schemaTableCalls(options.files));
  } catch (error) {
    return unresolvedDiscovery(options, error);
  }
}

/** The provider receipt states the denominator this collector actually MEASURED — the authored schema
 *  sources it walked — and nothing about what the census FOUND.
 *
 *  WHY NOT THE CENSUS: it was `members: <tables + columns + foreign keys + indexes>` plus an `unresolved`
 *  flag raised for a `missing`/`unresolved` fact, until 2026-09-11. `factReceiptFailures`
 *  (`lib/policy-pass.ts:641`) refuses a fact receipt with `members === 0` (`:631`) or `unresolved > 0`
 *  (`:635`) and `withholdFactDependents` (`:679`) drops every consumer BEFORE `evaluate` (`:821-822`), so a
 *  schema tree that declares no table — or one the reader could not follow — preempted the very policies
 *  that exist to report it. Both numbers are this fact's own MODELLED VALUE (`SchemaFact.status` plus the
 *  `SchemaFactReceipt` the fact PUBLISHES to consumers, which is a different object from this receipt), and
 *  both already have fail-closed owners: every ordinary consumer calls `recordReadySchemaFact`, which throws
 *  on any non-`ready` status, and `freeze-provenance-write-pairing-health` (hard/error) REPORTS a schema
 *  tree that no longer declares its guarded table. That arm — blindness mode B — was recorded as BLOCKED in
 *  that module's header for exactly this reason (#1962); it is enabled in the same commit as this line.
 *
 *  WHY THE CONSUMER CAN OWN THIS AND THE PROVIDER CANNOT — the ordering, which is the non-obvious fact the
 *  whole rule rests on: `evaluateRuns` (`lib/policy-pass.ts:721-733`) runs a policy's `evaluate`, THEN
 *  collects its receipts, THEN judges them. A consumer therefore REPORTS FIRST and refuses after, so one
 *  cause yields a finding OR a refusal by the consumer's own choice. `finishFactRuns` (`:668-686`) does the
 *  reverse for a provider — it judges the receipt before any consumer runs — so a provider receipting its
 *  census can only ever preempt. Same shape, opposite order, and that is the entire asymmetry.
 *
 *  WHAT THE REFUSAL STILL BITES: a population admitting zero authored paths — the provider genuinely could
 *  not look, which no consumer can distinguish from a schema tree that honestly declares nothing. That
 *  refusal is per-provider and fires one phase EARLIER, at population. Same ruling, same reason as
 *  `bus-fact.ts#PROVIDER_RECEIPT_SOURCE` (#1955) and `registry-fact.ts` (#1953).
 *
 *  WHAT THE RUNTIME DOES NOT BACKSTOP, so a reviewer must: `policyReceiptFailures` has no "policy produced
 *  no semantic receipt" arm (`factReceiptFailures` does), so a consumer that declares this fact, reads it and
 *  files NO receipt renders a clean verdict over an EMPTY census — measured, and pinned as the fail-open
 *  shape in `tests/tooling/verify/lib/schema-fact.test.ts`. What keeps THIS provider's guarantee universal is
 *  the shared helper: all 18 consumers call `recordReadySchemaFact`, which throws on any non-`ready` status
 *  and files the census receipt. A new consumer that skips it inherits no blindness door. */
const PROVIDER_RECEIPT_SOURCE = "drizzle-schema-sources";

/** THE ONE HOME for this family's §5b.5 POPULATION-PORT delta, so no member re-derives it and no member
 *  claims it byte-identical when it is not.
 *
 *  Every consumer declares THIS constant rather than re-spelling the globs — which is also what guide
 *  §4.5b's third structural gap asks for, since nothing checks that a provider's population is a subset of
 *  its consumers' and a consumer that narrowed below the provider would be handed nodes it may not NAME.
 *
 *  Against the legacy descriptors this population is an INTENTIONAL WIDENING BY EXACTLY ONE PATH, and it is
 *  lossless. The legacy schema gates scoped either by `_shared/schema-read.ts`'s `isSchemaFile`
 *  (`/^packages\/db\/src\/schema\/[^/]+\.ts$/` MINUS the barrel) or by the regex
 *  `/\/packages\/db\/src\/schema\//` (barrel included); `under: ["packages/db/src/schema/**"]` admits both
 *  plus any nested directory. Measured 2026-09-12 on the tracked tree: the directory holds 30 files and
 *  ZERO nested paths, and the ONE path the `isSchemaFile` form excluded —
 *  `packages/db/src/schema/index.ts`, the re-export barrel — carries ZERO `sqliteTable(` calls against 97
 *  across the other 29 files (that 97 is the positive control proving the search reached the directory).
 *  So the added path contributes no table, no column and no finding to any member. */
export const DRIZZLE_SCHEMA_POPULATION = {
  in: ["@db"],
  under: ["packages/db/src/schema/**"],
} as const;

export const drizzleSchemaFact = defineFact({
  id: "drizzle-schema",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  resources: [],
  create: (ctx) => {
    const calls: { declaration: VariableDeclaration; call: CallExpression }[] = [];
    let discoveryError: unknown;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile) => {
            if (!Node.isVariableDeclaration(node) || discoveryError !== undefined) {
              return;
            }
            // @orb-waive caught-failure-ownership(error): FK resolution error: surfaced as a structured tool-error in the schema-fact report; the broken FK is excluded from the fact census
            try {
              const call = schemaTableCall(node, sourceFile);
              if (call !== null) {
                calls.push({ declaration: node, call });
              }
            } catch (error) {
              discoveryError = error;
            }
          },
        },
      ],
      finish: (): SchemaQuery => {
        const query = discoveryError === undefined ? queryForCalls(ctx, calls) : unresolvedDiscovery(ctx, discoveryError);
        ctx.receipt({ kind: "population", source: PROVIDER_RECEIPT_SOURCE, members: ctx.files.length });
        return query;
      },
    };
  },
});
