// Invocation-local native schema extraction; the caller supplies its admitted SourceFiles and checker.
import { resolveModuleMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import type { UnresolvedReferenceFact } from "@orb/tooling/floor/code-facts/reference-fact-contract";
import type { CallExpression, Node as MorphNode, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SchemaFact, SchemaFactReceipt, SchemaModel, SchemaQuery, SchemaQueryOptions, SchemaTable } from "./schema-model-contract.ts";
import { columnFromReference, foreignKeyOf, indexesOf, tableForeignKeysOf, tableFromReference } from "./schema-resolve.ts";
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
} from "./schema-value.ts";

export function schemaTableCall(declaration: VariableDeclaration, sourceFile: SourceFile): CallExpression | null {
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

export function schemaTableCalls(files: readonly SourceFile[]): readonly { readonly declaration: VariableDeclaration; readonly call: CallExpression }[] {
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
  const foreignKeys = [...columns.filter((column) => column.foreignKey !== null), ...tables.flatMap((table) => table.foreignKeys)];
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
      foreignKeys: [],
    }));
    const tableByDeclaration = new Map(initialTables.map((table) => [schemaDeclarationKey(table.declaration), table]));
    const initialColumns = new Map(initialTables.flatMap((table) => table.columns.map((column) => [column.identity.key, column] as const)));
    const tablesWithoutCompositeForeignKeys = drafts.map((draft) => {
      const columns = draft.columns.map(({ operations: _operations, ...column }) => ({
        ...column,
        foreignKey: foreignKeyOf({ ...column, operations: _operations }, tableByDeclaration, initialColumns, canonicalPath),
      }));
      return {
        identity: draft.identity,
        declaration: draft.declaration,
        call: draft.call,
        sqlName: draft.sqlName,
        columns,
        indexes: indexesOf(draft),
        foreignKeys: [],
      };
    });
    const resolvedTablesByDeclaration = new Map(tablesWithoutCompositeForeignKeys.map((table) => [schemaDeclarationKey(table.declaration), table]));
    const resolvedColumns = new Map(
      tablesWithoutCompositeForeignKeys.flatMap((table) => table.columns.map((column) => [column.identity.key, column] as const)),
    );
    const tables = drafts.map((draft, index) => {
      const table = tablesWithoutCompositeForeignKeys[index];
      if (table === undefined) {
        throw new Error(`missing resolved schema table for ${draft.identity.key}`);
      }
      return { ...table, foreignKeys: tableForeignKeysOf(draft, resolvedTablesByDeclaration, resolvedColumns, canonicalPath) };
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

export function unresolvedDiscovery(options: SchemaQueryOptions, error: unknown): SchemaQuery {
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

export function queryForCalls(
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
