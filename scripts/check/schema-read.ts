// Shared drizzle-schema readers for the db gates (`fk-columns-indexed`, `fk-ondelete-stated`,
// `table-explicit-primary-key`) — ONE home for "what does this `sqliteTable(...)` declare", the same way
// `ast-read.ts` is the one home for the value-unwrap readers.
//
// The shape every reader keys on is the drizzle SQLite table call:
//   export const messages = sqliteTable("messages", { id: text("id").primaryKey(), … }, (t) => [ … ]);
// arg 0 = the SQL name · arg 1 = the columns object · arg 2 (optional) = the extras callback returning an
// ARRAY of index()/uniqueIndex()/primaryKey()/check() builders (the array form is the tree's only form;
// drizzle's legacy object-returning form would read here as zero extras, which fails CLOSED — the gates
// that consume this report a violation, never a silent pass).
import type { CallExpression, Node, PropertyAssignment, SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";

const SQLITE_TABLE = "sqliteTable";
/** `t.chatId` / `table.ownerId` → `chatId` / `ownerId`; a non-column argument keeps its own text. */
const RECEIVER_PREFIX_RE = /^[A-Za-z_$][\w$]*\./u;
const SCHEMA_FILE_RE = /^packages\/db\/src\/schema\/(?<name>[^/]+)\.ts$/u;
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";

/** One column property of the columns object literal. `text` is the whole `text("x")…` builder chain — the
 *  modifiers (`.references(`/`.primaryKey(`/`.unique(`) are read off it. */
export interface SchemaColumn {
  readonly name: string;
  readonly node: PropertyAssignment;
  readonly text: string;
}

/** One `sqliteTable(...)` declaration. */
export interface SchemaTable {
  /** The exported binding (`messages`). */
  readonly variableName: string;
  /** The SQL table name literal (`"messages"`), or undefined if it isn't a plain literal. */
  readonly sqlName: string | undefined;
  readonly call: CallExpression;
  readonly columns: readonly SchemaColumn[];
  /** The third argument (the extras callback), when present. */
  readonly extra: Node | undefined;
}

/** Is this repo-relative path a table-bearing schema SOURCE (the barrel is re-exports only)? */
export function isSchemaFile(repoRelPath: string): boolean {
  return SCHEMA_FILE_RE.test(repoRelPath) && repoRelPath !== SCHEMA_BARREL;
}

/** The columns object literal's property assignments, read into `SchemaColumn`s. */
function columnsOf(columnsArg: Node | undefined): SchemaColumn[] {
  if (columnsArg?.isKind(SyntaxKind.ObjectLiteralExpression) !== true) {
    return [];
  }
  const columns: SchemaColumn[] = [];
  for (const prop of columnsArg.getProperties()) {
    if (prop.isKind(SyntaxKind.PropertyAssignment)) {
      columns.push({ name: prop.getName(), node: prop, text: prop.getInitializer()?.getText() ?? "" });
    }
  }
  return columns;
}

/** The `sqliteTable(...)` initializer of a variable declaration, or undefined. */
function tableCall(decl: VariableDeclaration): CallExpression | undefined {
  const init = decl.getInitializer();
  if (init?.isKind(SyntaxKind.CallExpression) !== true || init.getExpression().getText() !== SQLITE_TABLE) {
    return;
  }
  return init;
}

/** Every `export const X = sqliteTable(...)` in a schema source, read into the shape above. */
export function schemaTables(sf: SourceFile): SchemaTable[] {
  const tables: SchemaTable[] = [];
  for (const stmt of sf.getVariableStatements()) {
    for (const decl of stmt.getDeclarations()) {
      const call = tableCall(decl);
      if (call === undefined) {
        continue;
      }
      const args = call.getArguments();
      const nameArg = args[0];
      tables.push({
        variableName: decl.getName(),
        sqlName: nameArg?.isKind(SyntaxKind.StringLiteral) === true ? nameArg.getLiteralText() : undefined,
        call,
        columns: columnsOf(args[1]),
        extra: args[2],
      });
    }
  }
  return tables;
}

/** The columns carrying a `.references(...)` — the child half of every FK in the table. */
export function referencingColumns(table: SchemaTable): SchemaColumn[] {
  return table.columns.filter((c) => c.text.includes(".references("));
}

/** The `X` names in an `.on(t.X, …)` / `primaryKey({ columns: [t.X, …] })` argument list, receiver-stripped. */
function columnNames(args: readonly Node[]): string[] {
  return args.map((a) => a.getText().replace(RECEIVER_PREFIX_RE, ""));
}

/** Every column that LEADS a B-tree index on this table: the first column of an `index()`/`uniqueIndex()`,
 *  the first column of a composite `primaryKey({ columns })`, and any column whose own builder carries
 *  `.primaryKey(`/`.unique(` (drizzle emits a single-column index for both).
 *
 *  LEADING, not "mentioned": SQLite can only use an index whose LEFTMOST column is the one constrained, so
 *  a column sitting second in a composite is unindexed for every predicate that knows only that column —
 *  which is exactly the FK parent-delete scan and the child lookup. */
export function leadingIndexedColumns(table: SchemaTable): Set<string> {
  const leading = new Set<string>();
  for (const column of table.columns) {
    if (column.text.includes(".primaryKey(") || column.text.includes(".unique(")) {
      leading.add(column.name);
    }
  }
  for (const call of table.extra?.getDescendantsOfKind(SyntaxKind.CallExpression) ?? []) {
    const first = leadingColumnOf(call);
    if (first !== undefined) {
      leading.add(first);
    }
  }
  return leading;
}

/** The FIRST column an extras-callback builder indexes: an `index()`/`uniqueIndex()` `.on(…)`, or a
 *  composite `primaryKey({ columns })`. Undefined for every other call (checks, `sql.raw`, …). */
function leadingColumnOf(call: CallExpression): string | undefined {
  const callee = call.getExpression();
  if (callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === "on") {
    const chain = callee.getExpression().getText();
    return chain.includes("index(") || chain.includes("uniqueIndex(") ? columnNames(call.getArguments())[0] : undefined;
  }
  return callee.getText() === "primaryKey" ? compositePrimaryKeyColumns(call)[0] : undefined;
}

/** The `columns: [t.a, t.b]` of a composite `primaryKey({ … })` call, receiver-stripped; empty for any
 *  other shape. */
export function compositePrimaryKeyColumns(call: CallExpression): string[] {
  const arg = call.getArguments()[0];
  if (arg?.isKind(SyntaxKind.ObjectLiteralExpression) !== true) {
    return [];
  }
  const prop = arg.getProperty("columns");
  if (prop?.isKind(SyntaxKind.PropertyAssignment) !== true) {
    return [];
  }
  const init = prop.getInitializer();
  return init?.isKind(SyntaxKind.ArrayLiteralExpression) === true ? columnNames(init.getElements()) : [];
}

/** Does this table declare a primary key at all — an inline `.primaryKey()` column or a composite
 *  `primaryKey({ columns })` extra? */
export function hasPrimaryKey(table: SchemaTable): boolean {
  if (table.columns.some((c) => c.text.includes(".primaryKey("))) {
    return true;
  }
  if (table.extra === undefined) {
    return false;
  }
  return table.extra
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((call) => call.getExpression().getText() === "primaryKey" && compositePrimaryKeyColumns(call).length > 0);
}
