// The column READ arms: raw-sql mentions, checker-resolved query reads, inferred-row reads,
// classification + candidate collection.
import type { SourceFile, Type } from "ts-morph";
import { Node, SyntaxKind, ts } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { canonicalCompilerPath } from "../../_shared/ts-workspace.ts";
import type { ColumnAudit, ColumnCandidate, ColumnClass, ColumnDef, ProducerlessTableCandidate, TableDef } from "../contract/types.ts";
import { byProdFirst, relPath } from "../ops/swallowed.ts";
import { memberReadOf } from "../ops/wiring.ts";
import { columnKey, isColumnConsumer, resolveTableDef, scanColumnWrites } from "./columns.ts";
import { KEY_SEP, REPO_ROOT } from "./root.ts";

export function rawSqlBlob(project: SourceCorpus): string {
  const parts: string[] = [];
  for (const sf of project.getSourceFiles()) {
    if (!isColumnConsumer(sf.getFilePath())) {
      continue;
    }
    for (const tagged of sf.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)) {
      const tag = tagged.getTag();
      if (Node.isIdentifier(tag) && tag.getText() === "sql") {
        parts.push(tagged.getTemplate().getText());
      }
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      if (Node.isPropertyAccessExpression(expr) && expr.getName() === "raw" && expr.getExpression().getText() === "sql") {
        parts.push(
          call
            .getArguments()
            .map((a) => a.getText())
            .join(" "),
        );
      }
    }
  }
  return parts.join("\n");
}

/** Word-boundary presence of a SQL column name in the raw-SQL blob. Escaped because a SQL name is
 *  `[a-z0-9_]` by our own db-structure gate, but the regex must not trust that. */
function mentionedInRawSql(blob: string, sqlColumn: string): boolean {
  return new RegExp(`\\b${sqlColumn.replace(GATE_META_RE, "\\$&")}\\b`, "u").test(blob);
}

const GATE_META_RE = /[.*+?^${}()|[\]\\]/gu;

/** The consumption verdict for one column from its counted sites. `opaque` forces the write half to UNKNOWN,
 *  which reads as "has a write" — never as "unwritten" — so the lens cannot call an opaquely-written column
 *  rot. The READ half is exact either way, which is what keeps `write-only`/`neither` meaningful. */
function classifyColumn(reads: number, writes: number, opaque: boolean): ColumnClass {
  const written = writes > 0 || opaque;
  if (reads > 0) {
    return written ? "read-write" : "read-only";
  }
  return written ? "write-only" : "neither";
}

/** The audit-stamp column names this repo writes by convention on nearly every table. */
const PROVENANCE_COLUMNS = new Set(["created_at", "updated_at"]);

/** The drizzle builders that make a column's value the SCHEMA'S, not a writer's decision. */
const COLUMN_DEFAULT_METHODS = new Set(["default", "$defaultFn", "$default", "$onUpdate", "$onUpdateFn"]);

/** A `created_at`/`updated_at` whose builder chain declares a DEFAULT — provenance, stamped by the schema.
 *  Both halves are required: the NAME alone would exempt a hand-written timestamp some writer deliberately
 *  stores (a real value), and a default alone says nothing about what the column means. */
function isConventionTimestamp(column: ColumnDef): boolean {
  if (!PROVENANCE_COLUMNS.has(column.sqlColumn)) {
    return false;
  }
  let cur: Node | undefined = Node.isPropertyAssignment(column.decl) ? column.decl.getInitializer() : undefined;
  while (cur !== undefined && Node.isCallExpression(cur)) {
    const expr = cur.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      return false;
    }
    if (COLUMN_DEFAULT_METHODS.has(expr.getName())) {
      return true;
    }
    cur = expr.getExpression();
  }
  return false;
}

/** Every column of `tables`, classified. Pure enumeration — no exemption policy, no printing (the verb owns
 *  both), so the self-test drives the same function the CLI does. */
export function collectColumnCandidates(project: SourceCorpus, tables: readonly TableDef[]): ColumnAudit {
  const { perTable, perColumn, opaqueTables } = scanColumnWrites(project, tables);
  const queryReads = scanQueryReads(project, tables);
  const rowReads = scanRowReads(project, tables);
  const tableReads = scanTableReads(project, tables);
  const blob = rawSqlBlob(project);
  const candidates: ColumnCandidate[] = [];
  for (const table of tables) {
    const opaque = opaqueTables.has(table.key);
    for (const column of table.columns) {
      const key = columnKey(column.tableKey, column.jsProp);
      const reads = [...new Set([...(queryReads.get(key) ?? []), ...(rowReads.get(key) ?? [])])].sort(byProdFirst);
      const writes = perColumn.get(key) ?? [];
      const klass = classifyColumn(reads.length, writes.length, opaque);
      candidates.push({
        column,
        // The provenance override applies to the WRITE-ONLY verdict only: a `created_at` nothing writes AND
        // nothing reads (`neither`) is still pure rot, and a read one is healthy — neither is an audit stamp
        // doing its job.
        klass: klass === "write-only" && isConventionTimestamp(column) ? "provenance" : klass,
        reads,
        writes,
        opaque,
        rawSql: mentionedInRawSql(blob, column.sqlColumn),
      });
    }
  }
  const producerlessTables = collectProducerlessTables(tables, candidates, tableReads, perTable);
  return { candidates, producerlessTables, opaqueTables, tableWrites: perTable };
}

/** Join table- and column-level read reach against table-level writes without changing any column verdict. */
function collectProducerlessTables(
  tables: readonly TableDef[],
  candidates: readonly ColumnCandidate[],
  tableReads: ReadonlyMap<string, readonly string[]>,
  tableWrites: ReadonlyMap<string, readonly string[]>,
): ProducerlessTableCandidate[] {
  const out: ProducerlessTableCandidate[] = [];
  for (const table of tables) {
    const readColumns = candidates.filter((candidate) => candidate.column.tableKey === table.key && candidate.reads.length > 0);
    const reads = [...new Set([...readColumns.flatMap((candidate) => candidate.reads), ...(tableReads.get(table.key) ?? [])])].sort(byProdFirst);
    const anchor = reads.length === 0 ? undefined : (readColumns[0]?.column.decl ?? table.columns[0]?.decl);
    if (anchor !== undefined && !tableWrites.has(table.key)) {
      out.push({
        table,
        anchor,
        reads,
      });
    }
  }
  return out;
}

/** The table-level read reach that a full-row `db.select().from(table)` carries without naming any column.
 *  Kept separate from the two column-read arms: selecting a row proves the TABLE is consumed, but does not
 *  prove which returned properties a caller reads. */
function scanTableReads(project: SourceCorpus, tables: readonly TableDef[]): ReadonlyMap<string, readonly string[]> {
  const byKey = new Map(tables.map((table) => [table.key, table]));
  const out = new Map<string, string[]>();
  for (const sf of project.getSourceFiles()) {
    if (!isColumnConsumer(sf.getFilePath())) {
      continue;
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const target = fullTableSelectTarget(call);
      const table = target === undefined ? undefined : resolveTableDef(target, byKey);
      if (table !== undefined) {
        const site = `${relPath(sf.getFilePath())}:${call.getStartLineNumber()}`;
        out.set(table.key, [...(out.get(table.key) ?? []), site]);
      }
    }
  }
  return out;
}

/** The table argument of `*.select(…).from(table)`, or undefined for every other call shape. */
function fullTableSelectTarget(call: Node): Node | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const from = call.getExpression();
  if (!Node.isPropertyAccessExpression(from) || from.getName() !== "from") {
    return;
  }
  const selectCall = from.getExpression();
  if (!Node.isCallExpression(selectCall)) {
    return;
  }
  const select = selectCall.getExpression();
  return Node.isPropertyAccessExpression(select) && select.getName() === "select" ? call.getArguments()[0] : undefined;
}

/** READ arm 1 — every reference to a column property from a consumer file, keyed like the write scan. This is
 *  the `<table>.<col>` QUERY surface (where/eq/orderBy/join/projection/returning). It does NOT see a `row.<col>`
 *  read through a declared `$inferSelect` alias (the mapped-type hole; arm 2 exists for exactly that).
 *
 *  ONE checker pass over the consumer files, never one language-service search per column. Each
 *  column-named identifier resolves through its own file's program checker and the relations
 *  `findReferences` applies to a property (root symbols of synthesized/mapped members, contextually typed
 *  object-literal and JSX keys, shorthand destructures). A per-column language-service search type-checks
 *  every program that contains the schema a second time, because the service keeps its own program beside
 *  ts-morph's; on the full tree that does not fit the pnpm heap floor. */
function scanQueryReads(project: SourceCorpus, tables: readonly TableDef[]): ReadonlyMap<string, readonly string[]> {
  const ctx: QueryReadCtx = {
    byDeclaration: new Map(tables.flatMap((table) => table.columns.map((column) => [declarationSite(column.decl.compilerNode), column] as const))),
    columnNames: new Set(tables.flatMap((table) => table.columns.map((column) => column.jsProp))),
    sites: new Map<string, Set<string>>(),
  };
  for (const sf of project.getSourceFiles()) {
    if (isColumnConsumer(sf.getFilePath())) {
      scanFileQueryReads(sf, ctx);
    }
  }
  return new Map([...ctx.sites].map(([key, sites]) => [key, [...sites]]));
}

/** The query-read scan's shared state: column declarations by site, the cheap name gate, and the sink. */
interface QueryReadCtx {
  readonly byDeclaration: ReadonlyMap<string, ColumnDef>;
  readonly columnNames: ReadonlySet<string>;
  readonly sites: Map<string, Set<string>>;
}

// Canonical file identity: every program parses its own copy of a schema file, so a declaration is matched by
// place, never by node identity.
const canonicalPaths = new Map<string, string>();

function declarationSite(node: ts.Node): string {
  const fileName = node.getSourceFile().fileName;
  let path = canonicalPaths.get(fileName);
  if (path === undefined) {
    path = canonicalCompilerPath(REPO_ROOT, fileName);
    canonicalPaths.set(fileName, path);
  }
  return `${path}${KEY_SEP}${String(node.getStart())}`;
}

function scanFileQueryReads(sf: SourceFile, ctx: QueryReadCtx): void {
  const checker = sf.getProject().getTypeChecker().compilerObject;
  const file = sf.compilerNode;
  const rel = relPath(sf.getFilePath());
  const visit = (node: ts.Node): void => {
    if (isColumnNameCandidate(node, ctx.columnNames)) {
      const site = `${rel}:${String(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1)}`;
      for (const symbol of referenceSymbols(node, checker)) {
        recordQueryRead(symbol, checker, site, ctx);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);
}

/** A name that could reference a column: an identifier, or the string key of `x["col"]`. */
function isColumnNameCandidate(node: ts.Node, columnNames: ReadonlySet<string>): node is ts.Identifier | ts.StringLiteral {
  if (ts.isIdentifier(node)) {
    return columnNames.has(node.text);
  }
  return ts.isStringLiteral(node) && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node && columnNames.has(node.text);
}

/** The symbols a name refers to, plus the property symbols `findReferences` relates it to: the contextual
 *  type's member for an object-literal or JSX key, and the source type's member for a `{ col }` destructure. */
function referenceSymbols(name: ts.Identifier | ts.StringLiteral, checker: ts.TypeChecker): readonly ts.Symbol[] {
  const own = checker.getSymbolAtLocation(name);
  const parent = name.parent;
  let carrier: ts.Type | undefined;
  if ((ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === name) {
    carrier = ts.isObjectLiteralExpression(parent.parent) ? checker.getContextualType(parent.parent) : undefined;
  } else if (ts.isJsxAttribute(parent) && parent.name === name) {
    carrier = checker.getContextualType(parent.parent);
  } else if (ts.isBindingElement(parent) && parent.name === name && parent.propertyName === undefined && ts.isObjectBindingPattern(parent.parent)) {
    carrier = checker.getTypeAtLocation(parent.parent);
  }
  const members = carrier === undefined ? [] : (carrier.isUnion() ? carrier.types : [carrier]).map((type) => type.getProperty(name.text));
  return [own, ...members].filter((symbol): symbol is ts.Symbol => symbol !== undefined);
}

/** Credit every column the symbol or its roots (a mapped or synthesized member's origin) declares. */
function recordQueryRead(symbol: ts.Symbol, checker: ts.TypeChecker, site: string, ctx: QueryReadCtx): void {
  for (const candidate of [symbol, ...checker.getRootSymbols(symbol)]) {
    for (const declaration of candidate.declarations ?? []) {
      const column = ts.isPropertyAssignment(declaration) ? ctx.byDeclaration.get(declarationSite(declaration)) : undefined;
      if (column !== undefined) {
        const key = columnKey(column.tableKey, column.jsProp);
        ctx.sites.set(key, (ctx.sites.get(key) ?? new Set<string>()).add(site));
      }
    }
  }
}

/** READ arm 2 — the row-shape scan. Keyed `<table declaration key>\0<jsProp>` like the write scan, built in ONE pass over
 *  the workspace so the per-column cost stays a map lookup. */
type RowReadScan = ReadonlyMap<string, string[]>;

/** The property NAMES of a type, or undefined when the type carries no usable shape (`any`/`unknown`/a
 *  primitive/an empty object) — those must never match, or every column of every table would read as live. */
function shapePropertyNames(type: Type): readonly string[] | undefined {
  if (type.isAny() || type.isUnknown()) {
    return;
  }
  const names = type.getProperties().map((p) => p.getName());
  return names.length === 0 ? undefined : names;
}

/** The tables `type` could be a ROW (or a projection/view) of: every property it carries is a column of T.
 *  Cached per type object — `.id`/`.name`/`.createdAt` accesses number in the thousands and re-deriving a
 *  property list per site is the difference between a minute and an hour. */
function rowTablesOf(type: Type, tables: readonly TableDef[], cache: Map<unknown, readonly TableDef[]>): readonly TableDef[] {
  const cached = cache.get(type.compilerType);
  if (cached !== undefined) {
    return cached;
  }
  const names = shapePropertyNames(type);
  const matches = names === undefined ? [] : tables.filter((t) => names.every((n) => t.columns.some((c) => c.jsProp === n)));
  cache.set(type.compilerType, matches);
  return matches;
}

/** ONE structural pass for every row-shaped READ in the workspace. The cheap gate runs FIRST — a property name
 *  that is no table's column never costs a type resolution, which is what keeps this arm affordable. */
export function scanRowReads(project: SourceCorpus, tables: readonly TableDef[]): RowReadScan {
  const out = new Map<string, string[]>();
  const scan: RowReadCtx = {
    tables,
    columnNames: new Set(tables.flatMap((t) => t.columns.map((c) => c.jsProp))),
    cache: new Map<unknown, readonly TableDef[]>(),
    add: (table, name, node) => {
      const key = columnKey(table.key, name);
      out.set(key, [...(out.get(key) ?? []), `${relPath(node.getSourceFile().getFilePath())}:${node.getStartLineNumber()}`]);
    },
  };
  for (const sf of project.getSourceFiles()) {
    if (isColumnConsumer(sf.getFilePath())) {
      scanFileRowReads(sf, scan);
    }
  }
  return out;
}

/** The row-read scan's shared state: the tables under audit, their column-name gate, the per-type match cache,
 *  and the sink. One object so the recursive helpers stay inside the house parameter budget. */
interface RowReadCtx {
  readonly tables: readonly TableDef[];
  readonly columnNames: ReadonlySet<string>;
  readonly cache: Map<unknown, readonly TableDef[]>;
  readonly add: (table: TableDef, name: string, node: Node) => void;
}

/** ONE file's row-shaped reads: member accesses (`<x>.<col>` / `<x>["<col>"]`) and destructures. */
function scanFileRowReads(sf: SourceFile, scan: RowReadCtx): void {
  for (const kind of [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression] as const) {
    for (const node of sf.getDescendantsOfKind(kind)) {
      recordAccessRead(node, scan);
    }
  }
  for (const pattern of sf.getDescendantsOfKind(SyntaxKind.ObjectBindingPattern)) {
    recordDestructuredReads(pattern, scan);
  }
}

/** ONE member access as a row read, if its name is a column and its object's shape is a row of some table.
 *  Reads through {@link memberReadOf} — the ONE spelling of "what member does this node read" (`.col`,
 *  `?.col`, `["col"]`); two copies is how one arm learns a shape and the other silently does not. */
function recordAccessRead(node: Node, scan: RowReadCtx): void {
  const access = memberReadOf(node);
  if (access === undefined || !scan.columnNames.has(access.name)) {
    return;
  }
  for (const table of rowTablesOf(access.object.getType(), scan.tables, scan.cache)) {
    scan.add(table, access.name, node);
  }
}

/** `const { <col> } = row` / `({ <col> }: Row) => …` — a destructure is a read of every name it binds. The
 *  pattern's own type IS the row type (ts-morph resolves a binding pattern to its declaration's type). */
function recordDestructuredReads(pattern: Node, scan: RowReadCtx): void {
  if (!Node.isObjectBindingPattern(pattern)) {
    return;
  }
  const bound = pattern.getElements().map((e) => (e.getPropertyNameNode() ?? e.getNameNode()).getText());
  if (!bound.some((n) => scan.columnNames.has(n))) {
    return;
  }
  for (const table of rowTablesOf(pattern.getType(), scan.tables, scan.cache)) {
    for (const name of bound.filter((n) => scan.columnNames.has(n))) {
      scan.add(table, name, pattern);
    }
  }
}

/** The four classes in report order — worst rot first, the healthy state last (and never printed as a hit). */
