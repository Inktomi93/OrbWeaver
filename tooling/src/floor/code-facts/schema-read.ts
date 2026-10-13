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
// (2026-08-31). The reader now follows a
// local or imported object-literal binding, through alias hops and through object spreads, and it FAILS
// LOUD (throws ⇒ a ToolError attributed to the calling gate, exit 2) on every other shape, on an
// unresolvable binding, and on a cycle. Columns keep their DECLARING node, so a gate's finding lands on the
// column's real home rather than on the table that composed it.
//
// EVERY MEMBER KIND IS ANSWERED, NONE IS SKIPPED (#1035). The first cut accepted PropertyAssignment and
// SpreadAssignment and silently DROPPED the rest, so one editor refactor — `const ownerId = text("owner_id")
// .references(...); sqliteTable("x", { id, ownerId })` — made `fk-columns-indexed` green where the
// byte-identical inline column REDs, with no alarm anywhere (v-gates, measured: resolvedColumns 3 -> 2).
// SHORTHAND resolves through the same local/imported binding an identifier does; a COMPUTED key resolves
// when its expression is a string literal; every other member kind, an unresolvable shorthand, a
// non-literal computed key, and a binding that resolves to ZERO columns REFUSE. The columns are also
// declared as a #946 POPULATION, so an empty or shrinking set is loud at the entrypoint even if some future
// shape slips the refusals.
import type { CallExpression, Node, ObjectLiteralExpression, Project, SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import { resolveStableExpression } from "./reference-fact.ts";
import type { UnresolvedReferenceFact } from "./reference-fact-contract.ts";
import { readSchemaObjectMembers } from "./schema-object.ts";
import type { SchemaObjectEntry } from "./schema-object-contract.ts";

const SQLITE_TABLE = "sqliteTable";
const SQLITE_CORE_MODULE = "drizzle-orm/sqlite-core";
/** `t.chatId` / `table.ownerId` → `chatId` / `ownerId`; a non-column argument keeps its own text. */
const RECEIVER_PREFIX_RE = /^[A-Za-z_$][\w$]*\./u;
const SCHEMA_FILE_RE = /^packages\/db\/src\/schema\/(?<name>[^/]+)\.ts$/u;
const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
const SCHEMA_SRC_DIR = "/packages/db/src/schema/";
const SCHEMA_BARREL_SUFFIX = "/schema/index.ts";
const COMPUTED_KEY_PREVIEW_LENGTH = 120;

/** One RESOLVED column of a `sqliteTable(...)` columns object — the reader's member record, whatever
 *  authoring shape declared it (an inline property, a shorthand pointing at a const, a computed literal
 *  key, or a member spread in from another object). */
export interface SchemaColumn {
  /** The column's KEY as drizzle sees it — a shorthand's binding name, a computed key's literal value. */
  readonly name: string;
  /** Where a consumer REPORTS: the property itself, or (for a shorthand) the binding that declares it, so
   *  the finding lands where the fix goes. */
  readonly node: Node;
  /** The whole `text("x")…` builder chain — the modifiers (`.references(`/`.primaryKey(`/`.unique(`) are
   *  read off it. Empty when the member has no initializer to read. */
  readonly text: string;
  /** The builder EXPRESSION, for the consumers that walk the call chain rather than its text. */
  readonly initializer: Node | undefined;
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
 *  columns object is then visible on the consuming gate's own row instead of reading as a clean ✓ (#945),
 *  and the COLUMNS ride the #946 `population` receipt so an empty set is refused at the entrypoint rather
 *  than merely printed (#1035 — the reader's refusals are the first wall, this is the backstop).
 *
 *  `floor` is the plumbing floor BELOW `verify`, so the return shape is spelled STRUCTURALLY rather than
 *  imported from the gate contract — an upward import would invert the tooling layering. It is assignable
 *  to `GateScanDeclaration` by construction, and `ctx.scan(schemaScan(project))` is where tsc proves it. */
export function schemaScan(project: Project): {
  readonly unit: string;
  readonly candidates: number;
  readonly scanned: number;
  readonly population: readonly { readonly source: string; readonly members: number }[];
} {
  const tables = schemaSources(project).flatMap((sf) => schemaTables(sf));
  const columns = tables.reduce((total, table) => total + table.columns.length, 0);
  return {
    unit: `schema table [tables=${tables.length} resolvedColumns=${columns}]`,
    candidates: tables.length,
    scanned: tables.length,
    population: [{ source: "drizzle columns", members: columns }],
  };
}

/** Is this repo-relative path a table-bearing schema SOURCE (the barrel is re-exports only)? */
export function isSchemaFile(repoRelPath: string): boolean {
  return SCHEMA_FILE_RE.test(repoRelPath) && repoRelPath !== SCHEMA_BARREL;
}

function columnsRefusal(fact: UnresolvedReferenceFact): never {
  const source = fact.node.getSourceFile().getFilePath();
  const kind = fact.node.getKindName();
  if (TsNode.isMethodDeclaration(fact.node) || TsNode.isGetAccessorDeclaration(fact.node) || TsNode.isSetAccessorDeclaration(fact.node)) {
    throw new Error(`schema-read: unsupported columns member kind ${kind} in ${source}`);
  }
  if (fact.detail.startsWith("computed schema member:") || TsNode.isComputedPropertyName(fact.node) || TsNode.isComputedPropertyName(fact.node.getParent())) {
    throw new Error(`schema-read: computed column key in ${source} is not a string literal: ${fact.detail}`);
  }
  if (fact.reason === "cycle") {
    throw new Error(`schema-read: columns binding cycle at ${source}: ${fact.detail}`);
  }
  if (fact.reason === "missing") {
    throw new Error(`schema-read: columns binding in ${source} resolves to no local declaration or named import: ${fact.detail}`);
  }
  throw new Error(`schema-read: unsupported columns expression in ${source}: ${fact.detail}`);
}

/** An absent argument is a consumer-owned malformed call; unreadable objects are never empty. */
export function resolveColumnsObject(columnsArg: Node | undefined): ObjectLiteralExpression | undefined {
  if (columnsArg === undefined) {
    return;
  }
  const members = readSchemaObjectMembers(columnsArg);
  if (members.kind === "unresolved") {
    return columnsRefusal(members);
  }
  const boundEmpty = members.value.emptySources.find((source) => source.bound);
  if (boundEmpty !== undefined) {
    throw new Error(`schema-read: columns binding ${boundEmpty.node.getText()} resolves to an EMPTY object — the table's column set cannot be established`);
  }
  return members.value.object;
}

function columnOfEntry(entry: SchemaObjectEntry): SchemaColumn {
  if (TsNode.isComputedPropertyName(entry.nameNode) && !entry.literalString) {
    throw new Error(
      `schema-read: computed column key in ${entry.nameNode.getSourceFile().getFilePath()} is not a string literal: ${entry.nameNode.getText().slice(0, COMPUTED_KEY_PREVIEW_LENGTH)}`,
    );
  }
  if (!TsNode.isShorthandPropertyAssignment(entry.node)) {
    return { name: entry.name, node: entry.node, text: entry.value.getText(), initializer: entry.value };
  }
  const value = resolveStableExpression(entry.value);
  const declaration = value.trace.declarations.findLast(TsNode.isVariableDeclaration);
  const initializer = declaration?.getInitializer();
  if (declaration === undefined || initializer === undefined) {
    throw new Error(
      `schema-read: shorthand column "${entry.name}" in ${entry.node.getSourceFile().getFilePath()} resolves to no local declaration or named import`,
    );
  }
  return { name: entry.name, node: declaration, text: initializer.getText(), initializer };
}

/** Structural columns projected from the same native authored members as the semantic schema query. */
export function columnProperties(columnsArg: Node | undefined): readonly SchemaColumn[] {
  if (columnsArg === undefined) {
    return [];
  }
  const members = readSchemaObjectMembers(columnsArg);
  if (members.kind === "unresolved") {
    return columnsRefusal(members);
  }
  const empty = members.value.emptySources.find((source) => source.bound || source.spread);
  if (empty !== undefined) {
    const reason = empty.bound ? "resolves to an EMPTY object" : "resolved to zero columns";
    throw new Error(`schema-read: columns ${empty.node.getText()} ${reason}`);
  }
  return members.value.entries.map(columnOfEntry);
}

/** The columns object literal's members, read into `SchemaColumn`s. */
function columnsOf(columnsArg: Node | undefined): readonly SchemaColumn[] {
  return columnProperties(columnsArg);
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
