// The column READ arms: raw-sql mentions, language-service query reads, inferred-row reads,
// classification + candidate collection.
import type { SourceFile, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { semanticReferenceNodes } from "../../_shared/ts-workspace.ts";
import type { ColumnAudit, ColumnCandidate, ColumnClass, ColumnDef, TableDef } from "../contract/types.ts";
import { byProdFirst, relPath } from "../ops/swallowed.ts";
import { memberReadOf } from "../ops/wiring.ts";
import { columnKey, isColumnConsumer, scanColumnWrites } from "./columns.ts";

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
  const { perColumn, opaqueTables } = scanColumnWrites(project, tables);
  const rowReads = scanRowReads(project, tables);
  const blob = rawSqlBlob(project);
  const candidates: ColumnCandidate[] = [];
  for (const table of tables) {
    const opaque = opaqueTables.has(table.varName);
    for (const column of table.columns) {
      const reads = [...new Set([...columnQueryReadSites(column), ...(rowReads.get(columnKey(column.tableVar, column.jsProp)) ?? [])])].sort(byProdFirst);
      const writes = perColumn.get(columnKey(column.tableVar, column.jsProp)) ?? [];
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
  return { candidates, opaqueTables };
}

/** READ arm 1 — every language-service reference to the column property outside the schema dir. This is the
 *  `<table>.<col>` QUERY surface (where/eq/orderBy/join/projection/returning). It does NOT see a `row.<col>`
 *  read through a declared `$inferSelect` alias (the mapped-type hole; arm 2 exists for exactly that). */
function columnQueryReadSites(column: ColumnDef): string[] {
  const nameNode = Node.isPropertyAssignment(column.decl) ? column.decl.getNameNode() : undefined;
  if (nameNode === undefined || !Node.isIdentifier(nameNode)) {
    return [];
  }
  const sites = new Set<string>();
  for (const ref of semanticReferenceNodes(nameNode)) {
    const fp = ref.getSourceFile().getFilePath();
    if (isColumnConsumer(fp)) {
      sites.add(`${relPath(fp)}:${ref.getStartLineNumber()}`);
    }
  }
  return [...sites];
}

/** READ arm 2 — the row-shape scan. Keyed `<tableVar>\0<jsProp>` like the write scan, built in ONE pass over
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
      const key = columnKey(table.varName, name);
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
