// Shared drizzle-schema readers for the db gates (`fk-columns-indexed`, `fk-ondelete-stated`,
// `table-explicit-primary-key`) — ONE home for "what does this `sqliteTable(...)` declare", the same way
// `ast-read.ts` is the one home for the value-unwrap readers.
//
// The shape every reader keys on is the drizzle SQLite table call:
//   a `sqliteTable("messages", { id: text("id").primaryKey(), … }, (t) => [ … ])` initializer on an exported const;
// arg 0 = the SQL name · arg 1 = the columns object · arg 2 (optional) = the extras callback returning an
// ARRAY of index()/uniqueIndex()/primaryKey()/check() builders (the array form is the tree's only form;
// drizzle's legacy object-returning form would read here as zero extras, which fails CLOSED — the gates
// that consume this report a violation, never a silent pass).
//
// THE COLUMNS OBJECT IS RESOLVED, NOT REQUIRED INLINE (#945). `sqliteTable("x", importedColumns, …)` used to
// read as ZERO columns here, and eight integrity gates (FK coverage, FK indexing, JSON write parity,
// lifecycle portability, soft refs, ownerId registry, banned shapes, branding) silently lost every
// obligation that moved with it while the schema file scan stayed healthy
// (docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md). The reader now follows a
// local or imported object-literal binding, through alias hops and through object spreads, and it FAILS
// LOUD (throws ⇒ a ToolError attributed to the calling gate, exit 2) on every other shape, on an
// unresolvable binding, and on a cycle. Columns keep their DECLARING node, so a gate's finding lands on the
// column's real home rather than on the table that composed it.
import type { CallExpression, Node, ObjectLiteralExpression, Project, PropertyAssignment, SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";

const SQLITE_TABLE = "sqliteTable";
const SQLITE_CORE_MODULE = "drizzle-orm/sqlite-core";
/** `t.chatId` / `table.ownerId` → `chatId` / `ownerId`; a non-column argument keeps its own text. */
const RECEIVER_PREFIX_RE = /^[A-Za-z_$][\w$]*\./u;
const SCHEMA_FILE_RE = /^packages\/db\/src\/schema\/(?<name>[^/]+)\.ts$/u;
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const SCHEMA_SRC_DIR = "/packages/db/src/schema/";
const SCHEMA_BARREL_SUFFIX = "/schema/index.ts";
/** How many characters of an unsupported columns expression the refusal quotes. */
const DIAGNOSTIC_PREVIEW_CHARS = 120;

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

/** Every table-bearing schema SOURCE in the project (the barrel is re-exports only). */
function schemaSources(project: Project): SourceFile[] {
  return project.getSourceFiles().filter((sf) => sf.getFilePath().includes(SCHEMA_SRC_DIR) && !sf.getFilePath().endsWith(SCHEMA_BARREL_SUFFIX));
}

/** The resolved schema POPULATION as a gate scan declaration: how many tables the schema sources yield and
 *  how many columns those tables actually RESOLVED to. A denominator that collapsed behind an imported
 *  columns object is then visible on the consuming gate's own row instead of reading as a clean ✓ (#945). */
export function schemaScan(project: Project): { readonly unit: string; readonly candidates: number; readonly scanned: number } {
  const tables = schemaSources(project).flatMap((sf) => schemaTables(sf));
  const columns = tables.reduce((total, table) => total + table.columns.length, 0);
  return { unit: `schema table [tables=${tables.length} resolvedColumns=${columns}]`, candidates: tables.length, scanned: tables.length };
}

/** Is this repo-relative path a table-bearing schema SOURCE (the barrel is re-exports only)? */
export function isSchemaFile(repoRelPath: string): boolean {
  return SCHEMA_FILE_RE.test(repoRelPath) && repoRelPath !== SCHEMA_BARREL;
}

/** Strip `as X` / `satisfies X` / parentheses so an authored object/identifier is reachable. Mirrors
 *  `verify/lib/ast-read.ts` `unwrapExpression`; `_shared` sits BELOW `verify` and cannot import from it. */
function unwrap(node: Node): Node {
  let current = node;
  while (TsNode.isAsExpression(current) || TsNode.isSatisfiesExpression(current) || TsNode.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

/** The declaration an identifier names: the same file's own const, or the one a named import points at.
 *  Undefined when nothing in reach binds it — the caller turns that into a loud refusal. */
function bindingFor(owner: SourceFile, localName: string): VariableDeclaration | undefined {
  const local = owner.getVariableDeclaration(localName);
  if (local !== undefined) {
    return local;
  }
  const imported = owner
    .getImportDeclarations()
    .flatMap((declaration) => declaration.getNamedImports().map((specifier) => ({ declaration, specifier })))
    .find(({ specifier }) => (specifier.getAliasNode()?.getText() ?? specifier.getName()) === localName);
  return imported === undefined ? undefined : imported.declaration.getModuleSpecifierSourceFile()?.getVariableDeclaration(imported.specifier.getName());
}

/** The object literal an expression denotes, following identifier/alias hops into local and imported
 *  declarations. Throws on any other shape (a call, a function, a spread of one), on an unresolvable
 *  binding, and on an alias cycle — a columns set this reader cannot establish must never read as EMPTY. */
function objectLiteralFor(expression: Node, seen: ReadonlySet<string>): ObjectLiteralExpression {
  const node = unwrap(expression);
  if (TsNode.isObjectLiteralExpression(node)) {
    return node;
  }
  if (!TsNode.isIdentifier(node)) {
    throw new Error(
      `schema-read: unsupported columns expression in ${node.getSourceFile().getFilePath()}: ${node.getText().slice(0, DIAGNOSTIC_PREVIEW_CHARS)}`,
    );
  }
  const name = node.getText();
  const declaration = bindingFor(node.getSourceFile(), name);
  if (declaration === undefined) {
    throw new Error(`schema-read: columns binding "${name}" in ${node.getSourceFile().getFilePath()} resolves to no local declaration or named import`);
  }
  const key = `${declaration.getSourceFile().getFilePath()}#${declaration.getName()}`;
  if (seen.has(key)) {
    throw new Error(`schema-read: columns binding cycle at ${key}`);
  }
  const initializer = declaration.getInitializer();
  if (initializer === undefined) {
    throw new Error(`schema-read: columns binding ${key} has no initializer`);
  }
  return objectLiteralFor(initializer, new Set([...seen, key]));
}

/** The `sqliteTable(…)` columns argument as an object literal, resolved through local/imported bindings.
 *  Undefined ONLY when the argument is absent (a malformed call); every unresolvable shape throws. */
export function resolveColumnsObject(columnsArg: Node | undefined): ObjectLiteralExpression | undefined {
  return columnsArg === undefined ? undefined : objectLiteralFor(columnsArg, new Set());
}

/** Every column PropertyAssignment of a resolved columns object, flattening object spreads (`{...base, x}`)
 *  into the same list. Each property keeps its own declaring node, so a consumer reports at the column's
 *  real home. */
export function columnProperties(columnsArg: Node | undefined): PropertyAssignment[] {
  const object = resolveColumnsObject(columnsArg);
  if (object === undefined) {
    return [];
  }
  const properties: PropertyAssignment[] = [];
  for (const prop of object.getProperties()) {
    if (prop.isKind(SyntaxKind.PropertyAssignment)) {
      properties.push(prop);
      continue;
    }
    if (prop.isKind(SyntaxKind.SpreadAssignment)) {
      properties.push(...columnProperties(prop.getExpression()));
    }
  }
  return properties;
}

/** The columns object literal's property assignments, read into `SchemaColumn`s. */
function columnsOf(columnsArg: Node | undefined): SchemaColumn[] {
  return columnProperties(columnsArg).map((prop) => ({ name: prop.getName(), node: prop, text: prop.getInitializer()?.getText() ?? "" }));
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
  return isImportedPrimaryKeyCall(call) ? compositePrimaryKeyColumns(call)[0] : undefined;
}

/** Is this call the actual drizzle primary-key builder — direct (including an alias) or through the
 * namespace imported from `drizzle-orm/sqlite-core`? A same-named property on any other object is not
 * schema evidence. */
function isImportedPrimaryKeyCall(call: CallExpression): boolean {
  const callee = call.getExpression();
  if (callee.isKind(SyntaxKind.Identifier)) {
    const localName = callee.getText();
    return call
      .getSourceFile()
      .getImportDeclarations()
      .filter((decl) => decl.getModuleSpecifierValue() === SQLITE_CORE_MODULE)
      .some((decl) =>
        decl.getNamedImports().some((named) => named.getName() === "primaryKey" && (named.getAliasNode()?.getText() ?? named.getName()) === localName),
      );
  }
  if (!callee.isKind(SyntaxKind.PropertyAccessExpression) || callee.getName() !== "primaryKey") {
    return false;
  }
  const receiver = callee.getExpression();
  if (!receiver.isKind(SyntaxKind.Identifier)) {
    return false;
  }
  const namespaceName = receiver.getText();
  return call
    .getSourceFile()
    .getImportDeclarations()
    .filter((decl) => decl.getModuleSpecifierValue() === SQLITE_CORE_MODULE)
    .some((decl) => decl.getNamespaceImport()?.getText() === namespaceName);
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
    .some((call) => isImportedPrimaryKeyCall(call) && compositePrimaryKeyColumns(call).length > 0);
}
