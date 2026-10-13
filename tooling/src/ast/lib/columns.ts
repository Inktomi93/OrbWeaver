// drizzle column defs + the STRUCTURAL write scan (schema tables ride floor/code-facts/schema-read).

import { drizzleWriteOf, writeKeysOf } from "@orb/tooling/floor/code-facts/drizzle-columns";
import { resolveDrizzleTableRefs } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import type { SchemaTable } from "@orb/tooling/floor/code-facts/schema-read";
import { schemaTables } from "@orb/tooling/floor/code-facts/schema-read";
import { Node, SyntaxKind } from "ts-morph";
import { readExecutedSqlInserts } from "../../floor/code-facts/drizzle-sql.ts";
import type { SourceCorpus } from "../../floor/compiler/ts-workspace.ts";
import type { TableDef, WriteScan } from "../contract/types.ts";
import { relPath } from "../ops/swallowed.ts";
import { declKey } from "./keys.ts";
import { isPackageSourcePath, isTestPath, KEY_SEP } from "./root.ts";

// ── columns: drizzle columns classified by CONSUMPTION (READ+WRITE / WRITE-only / READ-only / NEITHER) ─
// The owner-named RV-11 class: "the model writes a column nobody renders". Every liveness lens above keys on
// an EXPORT; a column is not an export — it is a property of a table config literal, reached through drizzle's
// generic machinery. So the import graph says a schema file is consumed and stops there, and a column that
// every writer fills and no reader ever selects looks exactly like a column the whole product depends on.
//
// THE IDENTITY IS A PAIR, NOT A `declKey` (the one lens in this file that does not key on a declaration node,
// and why that is correct here). `declKey` exists because an EXPORT NAME is ambiguous across files (three
// `requireParticipant`s). A column name is scoped BY ITS TABLE, so `(table declaration, JS property name)` is
// already unambiguous — and it has to be, because the write side is UNREACHABLE by declaration identity:
// drizzle's `$inferInsert`/`$inferSelect` are HOMOMORPHIC MAPPED TYPES, and a mapped type's synthesized
// property carries `declarations.length === 0` (measured 2026-08-03 on `packages/server/src/domain/rpg/
// game-mint.ts`'s insert literal: every property resolved to `target=<name> decls=0`). There is no node to key
// on. The table half is still resolved STRUCTURALLY — through `getDefinitionNodes()` to the table's own
// VariableDeclaration — so an identifier alias or a `schema.<table>` namespace access cannot fork a table.
//
// THE THREE ARMS, AND WHY THE READ SIDE NEEDS TWO OF THEM (measured, not assumed):
//   • READ arm 1 — QUERY references, resolved by the checker in one pass over the consumer files: every
//     column-named identifier whose symbol (or its root) is the column's PropertyAssignment is a
//     `<table>.<col>` reference (a `where`/`eq`/`orderBy`/join/select projection/`returning`). The same
//     relations `findReferences` applies, without one whole-program search per column.
//   • READ arm 2 — ROW-SHAPE accesses, structural, because arm 1 IS NOT ENOUGH and believing it was would
//     have shipped a lying lens. `typeof <table>.$inferSelect` is a mapped type too, so a `row.<col>` read
//     THROUGH a declared row alias resolves to a synthesized property with zero declarations and comes back
//     from arm 1 as NOTHING. Measured on the real tree: `packages/server/src/domain/plugin/persistence/
//     plugins.ts:23` does `name: row.name` on a `type PluginRow = typeof plugins.$inferSelect` — a plain
//     render read — and arm 1 scored `plugins.name` at `reads:0`. (Arm 1 DOES catch a row access when the row
//     type was inferred INLINE from the select, which is exactly why the hole is easy to miss: the same
//     read shape resolves or vanishes depending on whether an alias was declared.) So arm 2 asks the type,
//     not the language service: a `<x>.<col>` / `<x>["<col>"]` access, or an `{ <col> }` destructure, counts
//     as a read of table T when EVERY property name of `<x>`'s type is a column of T — a row of T, or any
//     projection/view derived from one. Deliberately OVER-inclusive (a `PluginView` whose fields are all
//     column names counts, and it usually IS the render path): over-counting reads under-reports rot, which
//     is the only safe direction for a lens whose job is to nominate columns for deletion.
//   • WRITES are STRUCTURAL, via the drizzle call chain, because the language service CANNOT see them (the
//     mapped-type hole above). Every `<db>.insert(<T>)….values(<arg>)`, `<db>.update(<T>)….set(<arg>)`, and
//     `.onConflictDoUpdate({ set: <arg> })` is walked back down its chain to the `insert`/`update` call that
//     names the table; an object-literal `<arg>`'s property keys ARE the written columns. For
//     `insert(<T>).select(db.select({ … }))`, the select projection keys are the destination columns. A
//     static raw-SQL `INSERT INTO table (columns…)` header also carries both identities, so a small SQL token
//     reader attributes it when that statement reaches `db.run`/`db.execute`/`db.batch`, without treating
//     construction of an inert SQL object as a write.
//
// THE OPAQUE-WRITER ARM (the honest half). `db.insert(sessions).values(row)` — a whole typed row, no literal —
// names no column, and `.set({ ...patch, … })` names only some. Such a site marks the TABLE `opaque`: every
// column of it becomes write-UNKNOWN, printed as `write?`, never "no write". So the lens never claims a column
// is unwritten when a whole-row writer could be filling it. The READ half is unaffected — which is why
// WRITE-only and NEITHER stay meaningful on an opaque table: their load-bearing half ("nothing reads it") is
// the exact one.
//
// V1 BLIND SPOTS, stated so a reader can price a verdict:
//   1. RAW SQL READS are NOT table-attributable. `sql\`… m.character_id …\`` names a column through a query
//      ALIAS; no cheap pass maps `m` to `messages`. So the raw-SQL read arm is deliberately TABLE-AGNOSTIC and
//      over-inclusive: a column whose SQL name appears as a word inside ANY raw `sql` template / `sql.raw()`
//      text in the workspace is annotated `raw?`. Executed static INSERT headers count as writes; dynamic SQL,
//      inert SQL objects, and raw reads never change a class — `raw?` tells the reader to inspect them.
//   2. A column reached ONLY through `Pick<NewX, "col">`-style string-literal type members is invisible to
//      both arms (measured: those LiteralType nodes resolve to `symbol=<none> decls=0`). It is a type-level
//      narrowing, never a read or a write on its own, so this is a non-loss — but a reader who sees a column
//      named in a `Pick` and flagged here should check the real call sites, not the `Pick`.
//   3. The schema dir itself is EXCLUDED from consumption: `t.chatId` inside a `uniqueIndex(...).on(t.chatId)`
//      or a CHECK is DDL, not consumption. Counting it would make every indexed column permanently "read".
//
// CANDIDATE lens, never a death sentence — same posture as `swallowed`/`typeonly-alive`, and MANUAL-tier for
// the same reason plus cost (a checker pass over every consumer file). A deliberate keep is
// `// @column-ok: <reason>` on the column property, and that marker is TWO-SIDED: a marker on a column the
// lens no longer flags (it is READ+WRITE now) is reported STALE and exits 1.
//
// CONVENTION TIMESTAMPS ARE A CLASS OF THEIR OWN (lens calibration, owner ruling 2026-08-13). Every one of
// the 16 WRITE-ONLY rows this lens produced on the calibration corpus was a junction table's
// `created_at`/`updated_at` carrying a schema DEFAULT — and the corpus wrote them up as "safe to kill", which
// is DANGEROUS: they are PROVENANCE, stamped by the schema's own `.default(…)`, kept so a row can be dated
// after the fact. "Nothing reads it back" is their normal state, not the RV-11 defect ("the model writes a
// column no surface renders"), so they are their own class — counted, named, and OUT of the actionable hit
// list. Two things this deliberately does NOT do: it does not touch the READ arms (an ORDER BY on the table
// object is ALREADY resolved — `characters.createdAt` is `orderBy(desc(characters.createdAt))` at
// observability/debug/inspect/list.ts:53 and classifies READ+WRITE, which is the positive control that the
// blind spot is not there), and it does not exempt a bare timestamp column with no default (that one really
// is a value some writer chose to store).
const COLUMN_OK_RE = /@column-ok:\s*\S/u;

const SCHEMA_DIR = "/packages/db/src/schema/";

/** How many consumption sites a hit names before it collapses to a count. */
export const COLUMN_SITES_SHOWN = 2;

/** Summary-table column widths: the class name pad, and the right-aligned count field. */
export const COLUMN_CLASS_PAD = 11;

export const COLUMN_COUNT_PAD = 4;

/** How a column is consumed across the workspace. `read-write` is the healthy state and never a hit; the
 *  next three are the findings — `write-only` is the RV-11 class (the model fills it, nothing renders it),
 *  `read-only` is a column nothing populates (a permanent default/NULL being read), `neither` is pure rot.
 *  `provenance` is the fifth and is NOT a finding: a `created_at`/`updated_at` with a schema DEFAULT that
 *  nothing reads back — an audit stamp doing exactly its job. */

/** True if the column property carries a leading `// @column-ok: <reason>` — a deliberate keep. The reason is
 *  required (a bare marker does NOT exempt, as with `@swallowed-ok:`/`@typeonly-ok:`/`@server-only:`). A
 *  PropertyAssignment owns its leading comments directly, so no {@link commentHost} hop is needed here. */
export function isColumnExempt(decl: Node): boolean {
  return decl.getLeadingCommentRanges().some((range) => COLUMN_OK_RE.test(range.getText()));
}

/** The SQL name a drizzle column builder was given: the innermost call of the property's initializer chain
 *  (`text("chat_id").$type<ChatId>().notNull().references(…)` → `chat_id`). Falls back to the JS property
 *  name when the chain carries no string literal (a shape this repo does not currently use). */
function sqlColumnName(init: Node | undefined, jsProp: string): string {
  let cur = init;
  while (cur !== undefined && Node.isCallExpression(cur)) {
    const arg = cur.getArguments()[0];
    if (arg !== undefined && Node.isStringLiteral(arg)) {
      return arg.getLiteralText();
    }
    const expr = cur.getExpression();
    cur = Node.isPropertyAccessExpression(expr) ? expr.getExpression() : undefined;
  }
  return jsProp;
}

/** Every `sqliteTable("<sql>", { … })` under `packages/db/src/schema/`, as the lens's TableDef. The
 *  "what does this `sqliteTable(...)` declare" READER is NOT re-spelled here — it is
 *  `tooling/src/verify/schema-read.ts`, the ONE home the db gates (`fk-columns-indexed`, `fk-ondelete-stated`,
 *  `table-explicit-primary-key`) already read through. This function adds only what those gates have no use
 *  for and this lens cannot work without: the SQL column NAME (the migration's spelling, so a reader can
 *  grep the baseline) and the table's declaration KEY (so a writer's identifier resolves to one table
 *  through an alias or a `schema.<table>` hop). A table whose SQL name is not a plain literal is skipped —
 *  there is nothing to report it under. */
export function collectSchemaTables(project: SourceCorpus): TableDef[] {
  const out: TableDef[] = [];
  for (const sf of project.getSourceFiles()) {
    // Path test by SUBSTRING, not schema-read's `isSchemaFile` — that predicate anchors on a REPO-RELATIVE
    // path, and every lens in this file must stay root-agnostic so the self-test can drive it over an
    // in-memory project rooted anywhere. (The barrel matches too; it declares no table, so it yields none.)
    if (!sf.getFilePath().includes(SCHEMA_DIR)) {
      continue;
    }
    for (const table of schemaTables(sf)) {
      const def = tableDefOf(table);
      if (def !== undefined) {
        out.push(def);
      }
    }
  }
  return out;
}

/** ONE `SchemaTable` as a TableDef, or undefined when it carries no literal SQL name / no binding to key on. */
function tableDefOf(table: SchemaTable): TableDef | undefined {
  const sqlName = table.sqlName;
  const binding = table.call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (sqlName === undefined || binding === undefined) {
    return;
  }
  const varName = table.variableName;
  const key = declKey(binding);
  const columns = table.columns.map((column) => ({
    tableKey: key,
    tableVar: varName,
    sqlTable: sqlName,
    jsProp: column.name,
    sqlColumn: sqlColumnName(column.initializer, column.name),
    decl: column.node as Node,
  }));
  return { varName, sqlName, key, columns };
}

/** `<table declaration key>\0<jsProp>` — the canonical identity every read/write/grouping arm shares. */
export function columnKey(tableKey: string, jsProp: string): string {
  return `${tableKey}${KEY_SEP}${jsProp}`;
}

/** A production file that CONSUMES columns: schema declarations and tests are evidence about the model,
 *  not product reads/writes. Counting either would make unused columns look permanently healthy. */
export function isColumnConsumer(fp: string): boolean {
  return isPackageSourcePath(fp) && !(fp.includes(SCHEMA_DIR) || isTestPath(fp));
}

/** Resolve a table EXPRESSION (`rpgGames`, `schema.rpgGames`, a local or drizzle alias) to its TableDef through
 *  the ONE table resolver the tenancy gates share (`floor/code-facts/drizzle-table-ref.ts`) — never by bare
 *  identifier text. Only a declaration this audit keys counts; a subquery or a typed parameter names no TableDef. */
export function resolveTableDef(expr: Node, byKey: ReadonlyMap<string, TableDef>): TableDef | undefined {
  return resolveDrizzleTableRefs(expr, (declaration) => byKey.has(declKey(declaration)))
    .map((ref) => (ref.kind === "table" ? byKey.get(declKey(ref.declaration)) : undefined))
    .find((hit) => hit !== undefined);
}

function recordRawHeader(header: { table: string; columns: readonly string[] }, tables: readonly TableDef[], site: string, writes: WriteScan): void {
  const table = tables.find((candidate) => candidate.sqlName.toLowerCase() === header.table.toLowerCase());
  if (table === undefined) {
    return;
  }
  writes.perTable.set(table.key, [...(writes.perTable.get(table.key) ?? []), site]);
  for (const sqlName of header.columns) {
    const column = table.columns.find((candidate) => candidate.sqlColumn.toLowerCase() === sqlName.toLowerCase());
    if (column !== undefined) {
      const key = columnKey(table.key, column.jsProp);
      writes.perColumn.set(key, [...(writes.perColumn.get(key) ?? []), site]);
    }
  }
}

function recordRawSqlWrites(call: Node, tables: readonly TableDef[], writes: WriteScan): void {
  for (const header of readExecutedSqlInserts(call)) {
    const site = `${relPath(header.node.getSourceFile().getFilePath())}:${header.node.getStartLineNumber()}`;
    recordRawHeader(header, tables, site, writes);
  }
}

/** ONE structural pass for every drizzle write in the workspace (outside the schema dir). */
export function scanColumnWrites(project: SourceCorpus, tables: readonly TableDef[]): WriteScan {
  const byKey = new Map(tables.map((t) => [t.key, t]));
  const writes: WriteScan = { perTable: new Map<string, string[]>(), perColumn: new Map<string, string[]>(), opaqueTables: new Map<string, string[]>() };
  for (const sf of project.getSourceFiles()) {
    if (!isColumnConsumer(sf.getFilePath())) {
      continue;
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      recordWriteCall(call, byKey, writes);
      recordRawSqlWrites(call, tables, writes);
    }
  }
  return writes;
}

/** Record ONE call expression's contribution to the write scan (a no-op for the overwhelming majority — any
 *  call whose chain does not reach a drizzle `insert`/`update`). */
function recordWriteCall(call: Node, byKey: ReadonlyMap<string, TableDef>, writes: WriteScan): void {
  const write = drizzleWriteOf(call);
  const table = write === undefined ? undefined : resolveTableDef(write.target, byKey);
  if (write === undefined || table === undefined) {
    return;
  }
  const site = `${relPath(call.getSourceFile().getFilePath())}:${call.getStartLineNumber()}`;
  writes.perTable.set(table.key, [...(writes.perTable.get(table.key) ?? []), site]);
  const { names, opaque } = writeKeysOf(write);
  for (const name of names) {
    const key = columnKey(table.key, name);
    writes.perColumn.set(key, [...(writes.perColumn.get(key) ?? []), site]);
  }
  if (opaque) {
    writes.opaqueTables.set(table.key, [...(writes.opaqueTables.get(table.key) ?? []), site]);
  }
}

/** Every raw-SQL text in the workspace, concatenated — a `sql` tagged template's full text and a
 *  `sql.raw(<literal>)` argument. TABLE-AGNOSTIC by construction (see the header's blind spot 1): the blob is
 *  searched for a column's SQL NAME only, because an alias-qualified `m.character_id` cannot be mapped back to
 *  its table by any cheap pass. */
