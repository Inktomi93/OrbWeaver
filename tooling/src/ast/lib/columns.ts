// drizzle column defs + the STRUCTURAL write scan (schema tables ride _shared/schema-read).

import type { SchemaTable } from "@orb/tooling/_shared/schema-read";
import { schemaTables } from "@orb/tooling/_shared/schema-read";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { TableDef, WriteScan } from "../contract/types.ts";
import { relPath } from "../ops/swallowed.ts";
import { declKey } from "./keys.ts";
import { KEY_SEP } from "./root.ts";

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
//   • READ arm 1 — QUERY references, via the language service. `findReferencesAsNodes()` on the column's
//     PropertyAssignment name node returns every `<table>.<col>` reference (a `where`/`eq`/`orderBy`/join/
//     select projection/`returning`). Exact, and unreachable any other way.
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
//     names the table; an object-literal `<arg>`'s property keys ARE the written columns.
//
// THE OPAQUE-WRITER ARM (the honest half). `db.insert(sessions).values(row)` — a whole typed row, no literal —
// names no column, and `.set({ ...patch, … })` names only some. Such a site marks the TABLE `opaque`: every
// column of it becomes write-UNKNOWN, printed as `write?`, never "no write". So the lens never claims a column
// is unwritten when a whole-row writer could be filling it. The READ half is unaffected — which is why
// WRITE-only and NEITHER stay meaningful on an opaque table: their load-bearing half ("nothing reads it") is
// the exact one.
//
// V1 BLIND SPOTS, stated so a reader can price a verdict:
//   1. RAW SQL is NOT table-attributable. `sql\`… m.character_id …\`` names a column through a query ALIAS; no
//      cheap pass maps `m` to `messages`. So the raw-SQL arm is deliberately TABLE-AGNOSTIC and
//      over-inclusive: a column whose SQL name appears as a word inside ANY raw `sql` template / `sql.raw()`
//      text in the workspace is annotated `raw?`. It never changes a class — it tells the reader "go read
//      those templates before calling this rot". A false `raw?` costs a minute; a missed one would let the
//      lens call a live column dead.
//   2. A column reached ONLY through `Pick<NewX, "col">`-style string-literal type members is invisible to
//      both arms (measured: those LiteralType nodes resolve to `symbol=<none> decls=0`). It is a type-level
//      narrowing, never a read or a write on its own, so this is a non-loss — but a reader who sees a column
//      named in a `Pick` and flagged here should check the real call sites, not the `Pick`.
//   3. The schema dir itself is EXCLUDED from consumption: `t.chatId` inside a `uniqueIndex(...).on(t.chatId)`
//      or a CHECK is DDL, not consumption. Counting it would make every indexed column permanently "read".
//
// CANDIDATE lens, never a death sentence — same posture as `swallowed`/`typeonly-alive`, and MANUAL-tier for
// the same reason plus cost (one reference resolution per column). A deliberate keep is
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

/** The drizzle write METHODS whose first argument names columns. `set` is name-ambiguous on its own
 *  (`Map.set`, `URLSearchParams.set`) — it only counts when the chain walk below lands on an `update(<T>)`
 *  call, which no non-drizzle receiver has. */
const DRIZZLE_WRITE_METHODS = new Set(["values", "set"]);

/** The upsert form: its argument is a CONFIG object whose `set` property holds the written columns. */
const DRIZZLE_UPSERT_METHOD = "onConflictDoUpdate";

/** The chain-terminating calls that NAME the table being written. */
const DRIZZLE_WRITE_ROOTS = new Set(["insert", "update"]);

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
  const columns = table.columns.map((column) => ({
    tableVar: varName,
    sqlTable: sqlName,
    jsProp: column.name,
    sqlColumn: sqlColumnName(column.initializer, column.name),
    decl: column.node as Node,
  }));
  return { varName, sqlName, key: declKey(binding), columns };
}

/** `<tableVar>\0<jsProp>` — the pair identity the write scan and the read scan agree on. */
export function columnKey(tableVar: string, jsProp: string): string {
  return `${tableVar}${KEY_SEP}${jsProp}`;
}

/** A file that CONSUMES columns: anything in the workspace except the schema dir itself (a `t.col` inside an
 *  index/CHECK is DDL, not consumption — counting it would make every indexed column permanently "read"). */
export function isColumnConsumer(fp: string): boolean {
  return !fp.includes(SCHEMA_DIR);
}

/** Walk a drizzle method chain down to the `insert(<T>)` / `update(<T>)` call that NAMES the table, and return
 *  that table expression. Undefined for any other receiver — which is what keeps `Map.set` / `Object.values`
 *  out of the write scan (their chains never reach an `insert`/`update` call). */
function drizzleWriteTarget(receiver: Node): Node | undefined {
  // ONE exit point: an early `return` inside the walk plus a trailing one is a shape tsc's noImplicitReturns
  // and biome's noUselessReturn cannot both accept — the accumulator satisfies both.
  let target: Node | undefined;
  let cur: Node | undefined = receiver;
  while (cur !== undefined && target === undefined) {
    const node: Node = cur;
    const inner: Node = Node.isCallExpression(node) ? node.getExpression() : node;
    if (!Node.isPropertyAccessExpression(inner)) {
      cur = undefined; // not a member access at all — the chain is not a drizzle write chain; stop.
      continue;
    }
    if (Node.isCallExpression(node) && DRIZZLE_WRITE_ROOTS.has(inner.getName())) {
      target = node.getArguments()[0];
      continue;
    }
    cur = inner.getExpression();
  }
  return target;
}

/** Resolve a table EXPRESSION (`rpgGames`, `schema.rpgGames`) to its TableDef through the definition graph —
 *  never by bare identifier text, so a local alias or a renaming import hop still lands on one table. */
function resolveTableDef(expr: Node, byKey: ReadonlyMap<string, TableDef>): TableDef | undefined {
  const id = Node.isPropertyAccessExpression(expr) ? expr.getNameNode() : expr;
  if (!Node.isIdentifier(id)) {
    return;
  }
  return id
    .getDefinitionNodes()
    .map((d) => byKey.get(declKey(d)))
    .find((hit) => hit !== undefined);
}

/** The columns one write ARGUMENT names, and whether it is (partly) OPAQUE. An object literal names its keys;
 *  a spread inside it hides the rest; an array literal is a multi-row insert (union of its elements); anything
 *  else (a typed variable, a call, a conditional) names nothing at all. */
function writtenKeysOf(arg: Node | undefined): { names: string[]; opaque: boolean } {
  if (arg === undefined) {
    return { names: [], opaque: true };
  }
  if (Node.isArrayLiteralExpression(arg)) {
    const merged = arg.getElements().map((e) => writtenKeysOf(e));
    return { names: merged.flatMap((m) => m.names), opaque: merged.some((m) => m.opaque) };
  }
  if (!Node.isObjectLiteralExpression(arg)) {
    return { names: [], opaque: true };
  }
  const names: string[] = [];
  let opaque = false;
  for (const prop of arg.getProperties()) {
    if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
      names.push(prop.getName());
    } else {
      opaque = true; // a spread (`{ ...patch }`) or a computed key — the rest of the row is unknown.
    }
  }
  return { names, opaque };
}

/** The write ARGUMENT of one drizzle write call: `.values(x)` / `.set(x)` take it directly; the upsert form
 *  `.onConflictDoUpdate({ target, set })` carries it on the config's `set` property. */
function writeArgOf(call: Node, method: string): Node | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const arg = call.getArguments()[0];
  if (method !== DRIZZLE_UPSERT_METHOD) {
    return arg;
  }
  if (arg === undefined || !Node.isObjectLiteralExpression(arg)) {
    return;
  }
  const setProp = arg.getProperty("set");
  return Node.isPropertyAssignment(setProp) ? setProp.getInitializer() : undefined;
}

/** ONE structural pass for every drizzle write in the workspace (outside the schema dir). */
export function scanColumnWrites(project: SourceCorpus, tables: readonly TableDef[]): WriteScan {
  const byKey = new Map(tables.map((t) => [t.key, t]));
  const perColumn = new Map<string, string[]>();
  const opaqueTables = new Map<string, string[]>();
  for (const sf of project.getSourceFiles()) {
    if (!isColumnConsumer(sf.getFilePath())) {
      continue;
    }
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      recordWriteCall(call, byKey, perColumn, opaqueTables);
    }
  }
  return { perColumn, opaqueTables };
}

/** Record ONE call expression's contribution to the write scan (a no-op for the overwhelming majority — any
 *  call whose chain does not reach a drizzle `insert`/`update`). */
function recordWriteCall(call: Node, byKey: ReadonlyMap<string, TableDef>, perColumn: Map<string, string[]>, opaqueTables: Map<string, string[]>): void {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const expr = call.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) {
    return;
  }
  const method = expr.getName();
  if (!(DRIZZLE_WRITE_METHODS.has(method) || method === DRIZZLE_UPSERT_METHOD)) {
    return;
  }
  const target = drizzleWriteTarget(expr.getExpression());
  const table = target === undefined ? undefined : resolveTableDef(target, byKey);
  if (table === undefined) {
    return;
  }
  const site = `${relPath(call.getSourceFile().getFilePath())}:${call.getStartLineNumber()}`;
  const { names, opaque } = writtenKeysOf(writeArgOf(call, method));
  for (const name of names) {
    const key = columnKey(table.varName, name);
    perColumn.set(key, [...(perColumn.get(key) ?? []), site]);
  }
  if (opaque) {
    opaqueTables.set(table.varName, [...(opaqueTables.get(table.varName) ?? []), site]);
  }
}

/** Every raw-SQL text in the workspace, concatenated — a `sql` tagged template's full text and a
 *  `sql.raw(<literal>)` argument. TABLE-AGNOSTIC by construction (see the header's blind spot 1): the blob is
 *  searched for a column's SQL NAME only, because an alias-qualified `m.character_id` cannot be mapped back to
 *  its table by any cheap pass. */
