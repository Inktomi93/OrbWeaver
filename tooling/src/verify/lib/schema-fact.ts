// Invocation-scoped Drizzle schema query built only from the policy's already-loaded source population.
import type { CallExpression, Node as MorphNode, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { ReferenceFact, UnresolvedReferenceFact } from "../contract/reference-fact.ts";
import type {
  SchemaColumn,
  SchemaColumnIdentity,
  SchemaFact,
  SchemaFactReceipt,
  SchemaForeignKey,
  SchemaIndex,
  SchemaModel,
  SchemaQuery,
  SchemaQueryOptions,
  SchemaTable,
  SchemaTableIdentity,
} from "../contract/schema-fact.ts";
import { readMemberReference, resolveModuleMemberOrigin, resolveStableExpression } from "./reference-fact.ts";
import type { ColumnDraft, TableDraft } from "./schema-fact-value.ts";
import {
  canonicalPathResolver,
  DRIZZLE_SQLITE,
  effectiveObjectProperty,
  exactDrizzleExport,
  guardCompositeBindings,
  operationChain,
  refuse,
  resolved,
  SchemaRefusal,
  SQLITE_TABLE,
  schemaDeclarationKey,
  schemaIndexKind,
  staticString,
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

function returnedExpression(node: MorphNode, subject: string): MorphNode {
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved") {
    return refuse({ ...stable, detail: `${subject}: ${stable.detail}` });
  }
  const callback = stable.value;
  if (!(Node.isArrowFunction(callback) || Node.isFunctionExpression(callback))) {
    return refuse(unresolved("unsupported", callback, `${subject} is not an authored callback`, stable.trace.declarations));
  }
  const body = callback.getBody();
  if (!Node.isBlock(body)) {
    return body;
  }
  const returned = body.getStatements().filter(Node.isReturnStatement);
  const expression = returned[0]?.getExpression();
  return returned.length === 1 && expression !== undefined
    ? expression
    : refuse(unresolved("dynamic", body, `${subject} must have exactly one explicit return expression`));
}

function arrayElements(node: MorphNode, subject: string, active = new Set<object>()): readonly MorphNode[] {
  const stable = resolveStableExpression(node);
  if (stable.kind === "unresolved") {
    return refuse({ ...stable, detail: `${subject}: ${stable.detail}` });
  }
  if (!Node.isArrayLiteralExpression(stable.value)) {
    return refuse(unresolved("unsupported", stable.value, `${subject} is not an authored array`, stable.trace.declarations));
  }
  guardCompositeBindings(stable.value, stable.trace.declarations, subject);
  if (active.has(stable.value.compilerNode)) {
    return refuse(unresolved("cycle", stable.value, `${subject} contains an array-spread cycle`));
  }
  active.add(stable.value.compilerNode);
  const elements: MorphNode[] = [];
  for (const element of stable.value.getElements()) {
    if (Node.isOmittedExpression(element)) {
      return refuse(unresolved("unsupported", element, `${subject} contains an array hole`));
    }
    elements.push(...(Node.isSpreadElement(element) ? arrayElements(element.getExpression(), subject, active) : [element]));
  }
  active.delete(stable.value.compilerNode);
  return elements;
}

function tableFromReference(node: MorphNode, byDeclaration: ReadonlyMap<string, SchemaTable>): ReferenceFact<SchemaTable> {
  if (Node.isVariableDeclaration(node)) {
    const direct = byDeclaration.get(schemaDeclarationKey(node));
    return direct === undefined ? unresolved("missing", node, `${node.getText()} is not a resolved schema table`) : resolved(direct, node, [node]);
  }
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "resolved" && origin.value.canonical.kind === "project") {
    const table = byDeclaration.get(schemaDeclarationKey(origin.value.canonical.declaration));
    if (table !== undefined) {
      return resolved(table, origin.trace.origin, origin.trace.declarations);
    }
  }
  const stable = resolveStableExpression(node);
  const declaration = stable.trace.declarations.find((candidate) => byDeclaration.has(schemaDeclarationKey(candidate)));
  if (declaration !== undefined) {
    const table = byDeclaration.get(schemaDeclarationKey(declaration));
    if (table !== undefined) {
      return resolved(table, stable.trace.origin, stable.trace.declarations);
    }
  }
  if (origin.kind === "unresolved" && origin.reason !== "missing") {
    return origin;
  }
  return stable.kind === "unresolved" ? stable : unresolved("missing", node, `${node.getText()} does not resolve to a schema table`, stable.trace.declarations);
}

function columnFromReference(
  node: MorphNode,
  byDeclaration: ReadonlyMap<string, SchemaTable>,
  byKey: ReadonlyMap<string, SchemaColumn>,
): ReferenceFact<SchemaColumn> {
  const member = readMemberReference(node);
  if (member.kind === "unresolved") {
    return member;
  }
  const table = tableFromReference(member.value.receiver, byDeclaration);
  if (table.kind === "unresolved") {
    return table;
  }
  const column = byKey.get(`${table.value.identity.key}.${member.value.name}`);
  return column === undefined
    ? unresolved("missing", member.value.nameNode, `${table.value.identity.key} has no column ${member.value.name}`, table.trace.declarations)
    : resolved(column, member.trace.origin, [...table.trace.declarations, ...member.trace.declarations]);
}

function callbackColumn(
  node: MorphNode,
  parameter: MorphNode | null,
  table: SchemaTableIdentity,
  columns: ReadonlyMap<string, SchemaColumnIdentity>,
): SchemaColumnIdentity | null {
  if (parameter === null) {
    return null;
  }
  const member = readMemberReference(node);
  if (member.kind === "unresolved") {
    if (member.reason === "unsupported") {
      return null;
    }
    return refuse(member);
  }
  const receiver = resolveStableExpression(member.value.receiver);
  const parameterSymbol = Node.isIdentifier(parameter) ? parameter.getSymbol() : undefined;
  const receiverSymbol = Node.isIdentifier(member.value.receiver) ? member.value.receiver.getSymbol() : undefined;
  const isParameter = parameterSymbol !== undefined && receiverSymbol?.compilerSymbol === parameterSymbol.compilerSymbol;
  if (!isParameter || (receiver.kind === "unresolved" && receiver.reason !== "missing")) {
    return null;
  }
  return columns.get(member.value.name) ?? refuse(unresolved("missing", member.value.nameNode, `${table.key} has no column ${member.value.name}`));
}

function foreignKeyOf(
  column: ColumnDraft,
  tables: ReadonlyMap<string, SchemaTable>,
  columns: ReadonlyMap<string, SchemaColumn>,
  canonicalPath: (sourceFile: SourceFile) => string,
): SchemaForeignKey | null {
  const calls = column.operations.get("references") ?? [];
  if (calls.length === 0) {
    return null;
  }
  const call = calls[0];
  if (call === undefined || calls.length !== 1) {
    return refuse(unresolved("ambiguous", column.expression, `${column.identity.key} has multiple references operations`));
  }
  const targetArg = call.getArguments()[0];
  if (targetArg === undefined) {
    return refuse(unresolved("missing", call, `${column.identity.key} references call has no target`));
  }
  const targetNode = returnedExpression(targetArg, `${column.identity.key} references target`);
  const target = foreignTarget(targetNode, tables, columns, canonicalPath);
  if (target.kind === "unresolved") {
    return refuse({ ...target, detail: `${column.identity.key} references target: ${target.detail}` });
  }
  const config = call.getArguments()[1];
  const onDeleteNode = config === undefined ? null : effectiveObjectProperty(config, "onDelete", `${column.identity.key} references config`);
  return {
    child: column.identity,
    parent: target.value,
    onDelete: onDeleteNode === null ? { kind: "unspecified" } : { kind: "specified", value: staticString(onDeleteNode, `${column.identity.key} onDelete`) },
    call,
  };
}

function foreignTarget(
  node: MorphNode,
  tables: ReadonlyMap<string, SchemaTable>,
  columns: ReadonlyMap<string, SchemaColumn>,
  canonicalPath: (sourceFile: SourceFile) => string,
): ReferenceFact<SchemaForeignKey["parent"]> {
  const local = columnFromReference(node, tables, columns);
  if (local.kind === "resolved") {
    return resolved({ kind: "population-column", column: local.value.identity }, local.trace.origin, local.trace.declarations);
  }
  const member = readMemberReference(node);
  if (member.kind === "unresolved") {
    return member;
  }
  const origin = resolveModuleMemberOrigin(member.value.receiver);
  if (origin.kind === "unresolved") {
    return local.reason === "missing" ? origin : local;
  }
  if (origin.value.canonical.kind !== "project") {
    return unresolved(
      "missing",
      member.value.receiver,
      `${member.value.receiver.getText()} has no resolved project table declaration`,
      origin.trace.declarations,
    );
  }
  const exportedTable = origin.value.canonical.exportedName;
  const moduleSpecifier = origin.value.moduleSpecifier;
  const sourcePath = canonicalPath(origin.value.canonical.sourceFile);
  const value: SchemaForeignKey["parent"] = {
    kind: "external-column",
    sourcePath,
    moduleSpecifier,
    exportedTable,
    propertyName: member.value.name,
    key: `${sourcePath}#${exportedTable}.${member.value.name}`,
  };
  return resolved(value, origin.trace.origin, [...origin.trace.declarations, ...member.trace.declarations]);
}

function indexName(root: CallExpression, kind: SchemaIndex["kind"]): SchemaIndex["name"] {
  if (kind === "primary-key") {
    const config = root.getArguments()[0];
    const nameNode = config === undefined ? null : effectiveObjectProperty(config, "name", "primary key config");
    return nameNode === null ? { kind: "unnamed" } : { kind: "named", value: staticString(nameNode, "primary key name") };
  }
  const node = root.getArguments()[0];
  return node === undefined ? refuse(unresolved("missing", root, `${kind} has no name`)) : { kind: "named", value: staticString(node, `${kind} name`) };
}

interface IndexTermInput {
  readonly root: CallExpression;
  readonly operations: ReadonlyMap<string, readonly CallExpression[]>;
  readonly kind: SchemaIndex["kind"];
  readonly parameter: MorphNode | null;
  readonly table: SchemaTableIdentity;
  readonly columns: ReadonlyMap<string, SchemaColumnIdentity>;
}

function indexTerms(input: IndexTermInput): SchemaIndex["terms"] {
  let nodes: readonly MorphNode[];
  if (input.kind === "primary-key") {
    const config = input.root.getArguments()[0];
    const value = config === undefined ? null : effectiveObjectProperty(config, "columns", "primary key config");
    if (value === null) {
      return refuse(unresolved("missing", input.root, "primary key config has no columns"));
    }
    nodes = arrayElements(value, "primary key columns");
  } else {
    const onCalls = input.operations.get("on") ?? [];
    const on = onCalls[0];
    if (on === undefined || onCalls.length !== 1) {
      return refuse(unresolved("missing", input.root, `${input.kind} must have exactly one on(...) operation`));
    }
    nodes = on.getArguments();
  }
  return nodes.map((node) => {
    const column = callbackColumn(node, input.parameter, input.table, input.columns);
    return column === null ? { kind: "expression" as const, node } : { kind: "column" as const, column };
  });
}

function indexesOf(table: TableDraft): readonly SchemaIndex[] {
  if (table.extra === null) {
    return [];
  }
  const callback = resolveStableExpression(table.extra);
  if (callback.kind === "unresolved") {
    return refuse({ ...callback, detail: `${table.identity.key} extras callback: ${callback.detail}` });
  }
  const functionNode = callback.value;
  if (!(Node.isArrowFunction(functionNode) || Node.isFunctionExpression(functionNode))) {
    return refuse(unresolved("unsupported", functionNode, `${table.identity.key} extras is not an authored callback`));
  }
  const parameters = functionNode.getParameters();
  const name = parameters[0]?.getNameNode();
  const parameter = name !== undefined && Node.isIdentifier(name) ? name : null;
  if (parameters.length > 1 || (parameters.length === 1 && parameter === null)) {
    return refuse(unresolved("unsupported", functionNode, `${table.identity.key} extras must have zero parameters or one identifier table parameter`));
  }
  const columns = new Map(table.columns.map((column) => [column.identity.propertyName, column.identity]));
  const indexes: SchemaIndex[] = [];
  for (const element of arrayElements(returnedExpression(functionNode, `${table.identity.key} extras`), `${table.identity.key} extras return`)) {
    const chain = operationChain(element);
    const builder = exactDrizzleExport(chain.root);
    if (builder.kind === "unresolved") {
      return refuse({ ...builder, detail: `${table.identity.key} extra: ${builder.detail}` });
    }
    const kind = schemaIndexKind(builder.value.exportedName);
    if (kind === null) {
      continue;
    }
    const terms = indexTerms({ root: chain.root, operations: chain.operations, kind, parameter, table: table.identity, columns });
    indexes.push({
      kind,
      name: indexName(chain.root, kind),
      terms,
      columns: terms.flatMap((term) => (term.kind === "column" ? [term.column] : [])),
      call: chain.root,
    });
  }
  return indexes;
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
 *  What the refusal still bites: a population admitting zero authored paths — the provider genuinely could
 *  not look, which no consumer can distinguish from a schema tree that honestly declares nothing. That
 *  refusal is per-provider and fires one phase EARLIER, at population. Same ruling, same reason as
 *  `bus-fact.ts#PROVIDER_RECEIPT_SOURCE` (#1955) and `registry-fact.ts` (#1953). */
const PROVIDER_RECEIPT_SOURCE = "drizzle-schema-sources";

export const DRIZZLE_SCHEMA_POPULATION = {
  in: ["@db"],
  under: ["packages/db/src/schema/**"],
  ext: ["ts", "tsx"],
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
