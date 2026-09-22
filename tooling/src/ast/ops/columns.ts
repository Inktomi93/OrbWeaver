// columns: every drizzle column classified by workspace consumption.

import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { ColumnAudit, ColumnCandidate, ColumnClass, Flags, Hit, ProducerlessTableCandidate, TableDef } from "../contract/types.ts";
import { collectColumnCandidates } from "../lib/column-reads.ts";
import { COLUMN_CLASS_PAD, COLUMN_COUNT_PAD, COLUMN_SITES_SHOWN, collectSchemaTables, isColumnExempt } from "../lib/columns.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { exitToolError, noteUnits, scanCorpus } from "../lib/ledger.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

const COLUMN_CLASS_ORDER: readonly ColumnClass[] = ["neither", "write-only", "read-only", "provenance", "read-write"];

/** The classes that are NOT findings — printed in the summary, never in the actionable hit list. */
const COLUMN_CLASSES_NOT_FLAGGED: ReadonlySet<ColumnClass> = new Set<ColumnClass>(["read-write", "provenance"]);

/** The one-line explanation each class carries in the summary — what a reader should DO about it. */
const COLUMN_CLASS_NOTE: Record<ColumnClass, string> = {
  neither: "pure rot — no reader, no writer, no raw-SQL mention: the column exists and nothing in the workspace touches it",
  "write-only": "the RV-11 class — something FILLS it and nothing ever reads it back (the model writes what no surface renders)",
  "read-only": "read but never written — a permanent DEFAULT/NULL being rendered as if it were data",
  provenance: "a `created_at`/`updated_at` with a schema DEFAULT that nothing reads back — an audit stamp doing its job (NEVER a hit; do not 'reclaim' these)",
  "read-write": "healthy (never a hit)",
};

function columnHit(candidate: ColumnCandidate): Hit {
  const { column, reads, writes, opaque, rawSql } = candidate;
  const shownReads = reads.slice(0, COLUMN_SITES_SHOWN).join(", ");
  const shownWrites = writes.slice(0, COLUMN_SITES_SHOWN).join(", ");
  const readPart = reads.length === 0 ? "reads:0" : `reads:${reads.length} (${shownReads}${reads.length > COLUMN_SITES_SHOWN ? " +more" : ""})`;
  const writeBase = opaque && writes.length === 0 ? "write?:opaque-whole-row-writer" : `writes:${writes.length}`;
  const writePart = writes.length === 0 ? writeBase : `${writeBase} (${shownWrites}${writes.length > COLUMN_SITES_SHOWN ? " +more" : ""})`;
  const h = hitOf(column.decl, `column-${candidate.klass}`);
  h.text = `${column.sqlTable}.${column.sqlColumn}  (${column.tableVar}.${column.jsProp})  —  ${readPart}  ${writePart}${rawSql ? "  raw?" : ""}`;
  return h;
}

function producerlessTableHit(candidate: ProducerlessTableCandidate): Hit {
  const shownReads = candidate.reads.slice(0, COLUMN_SITES_SHOWN).join(", ");
  const hit = hitOf(candidate.anchor, "column-table-producerless");
  hit.text = `${candidate.table.sqlName}  (${candidate.table.varName})  —  table reads:${candidate.reads.length} (${shownReads}${candidate.reads.length > COLUMN_SITES_SHOWN ? " +more" : ""})  production writes:0`;
  return hit;
}

/** The AUDIT TABLE — the deliverable a reader actually wants above the hit list: how many columns each class
 *  holds, and which tables carry an opaque whole-row writer (the rows whose write half is UNKNOWN). */
function printColumnSummary(audit: ColumnAudit, tables: readonly TableDef[], flags: Flags): void {
  narrate(flags, `columns: ${audit.candidates.length} column(s) across ${tables.length} table(s)`);
  for (const klass of COLUMN_CLASS_ORDER) {
    const inClass = audit.candidates.filter((c) => c.klass === klass);
    const raw = inClass.filter((c) => c.rawSql).length;
    narrate(
      flags,
      `  ${klass.padEnd(COLUMN_CLASS_PAD)} ${String(inClass.length).padStart(COLUMN_COUNT_PAD)}   ${COLUMN_CLASS_NOTE[klass]}${raw === 0 ? "" : ` — ${raw} annotated raw?`}`,
    );
  }
  const scopedOpaque = tables
    .filter((table) => audit.opaqueTables.has(table.key))
    .map((table) => table.varName)
    .sort();
  if (scopedOpaque.length > 0) {
    narrate(
      flags,
      `  opaque-write tables (${scopedOpaque.length}): ${scopedOpaque.join(", ")} — a whole-row/spread writer names no column, so every column of these tables reads as \`write?\`, never "unwritten".`,
    );
  }
}

/** The STALE side of the `@column-ok` marker: a tag on a column the lens no longer flags (it is READ+WRITE
 *  now). Printed and exit-1 so the marker cannot rot into a permanent lie (the two-sided-gate law). */
function printStaleColumnTags(candidates: readonly ColumnCandidate[], flags: Flags): void {
  const stale = candidates.filter((c) => isColumnExempt(c.column.decl) && c.klass === "read-write").map((c) => columnHit(c));
  if (stale.length === 0) {
    return;
  }
  narrate(
    flags,
    `columns: ${stale.length} STALE \`@column-ok:\` marker(s) — the column is READ+WRITE now (a reader and a writer both reach it), so the exemption states nothing. Delete the marker or re-state the reason:`,
  );
  for (const h of stale) {
    narrate(flags, `  ! ${h.file}:${h.line}  [stale-column-ok]  ${h.text}`);
  }
  process.exitCode = 1;
}

/** Every drizzle column classified by CONSUMPTION across the workspace. Optional scope = a SQL-table-name /
 *  table-variable / schema-file substring; bare = every table. A deliberate keep carries
 *  `// @column-ok: <reason>` on the column property; a stale marker exits 1. */
export function cmdColumns(project: SourceCorpus, arg: string, flags: Flags): void {
  const all = collectSchemaTables(project);
  const tables =
    arg === ""
      ? all
      : all.filter((t) => t.sqlName.includes(arg) || t.varName.includes(arg) || t.columns[0]?.decl.getSourceFile().getFilePath().includes(arg) === true);
  noteUnits("tables", tables.length);
  if (tables.length === 0) {
    exitToolError(
      `ast columns: scope "${arg}" matched no table — pass a SQL table name (rpg_games), a table variable (rpgGames), a schema-file substring (schema/rpg), or run bare for all ${all.length} tables.`,
    );
  }
  // The scope resolves to TABLES; the files it admits are the schema files those tables are declared in
  // (the read/write arms then walk the workspace to decide each column — substrate, not candidate corpus).
  scanCorpus(project, { scope: tables.flatMap((t) => t.columns.map((c) => c.decl.getSourceFile().getFilePath())), label: "path:schema-files" });
  const audit = collectColumnCandidates(project, tables);
  printColumnSummary(audit, tables, flags);
  printStaleColumnTags(audit.candidates, flags);
  const flaggable = audit.candidates.filter((c) => !COLUMN_CLASSES_NOT_FLAGGED.has(c.klass));
  const flagged = flaggable.filter((c) => !isColumnExempt(c.column.decl));
  const exempt = flaggable.length - flagged.length;
  const ordered = [
    ...audit.producerlessTables.map(producerlessTableHit),
    ...COLUMN_CLASS_ORDER.flatMap((klass) => flagged.filter((c) => c.klass === klass)).map(columnHit),
  ];
  if (flags.all) {
    printColumnsPerTable(tables, flagged, audit.producerlessTables, flags);
  }
  narrate(
    flags,
    `columns is a CANDIDATE lens. A \`column-table-producerless\` hit means at least one production read reaches the table but no production drizzle insert/update or executed static raw INSERT resolves to it; test/tool/schema writers and inert SQL objects never acquit it, while empty/default-only and opaque whole-row production writers do. READS are the union of two arms — language-service \`<table>.<col>\` query references PLUS a row-shape scan for \`<row>.<col>\` reads (needed because \`$inferSelect\` is a mapped type: a read through a declared row alias is INVISIBLE to reference resolution). The row-shape arm is deliberately OVER-inclusive, so a read count can be generous — which is the safe direction. WRITES are STRUCTURAL for the same mapped-type reason, including named insert-select projections and static raw-SQL INSERT headers executed by \`db.run\`/\`db.execute\`/\`db.batch\`; a table with a whole-row/spread/positional-select writer marks every column \`write?\`, never "unwritten". A \`raw?\` annotation means the column's SQL name appears in some raw \`sql\` template — raw reads remain table-agnostic, so inspect those before calling a column rot. A \`created_at\`/\`updated_at\` with a schema DEFAULT that nothing reads back is classed \`provenance\`, counted in the table above and NEVER listed as a hit — an audit stamp is not the RV-11 class. Keep one deliberately with \`// @column-ok: <reason>\` on the column property.${exempt === 0 ? "" : ` (${exempt} candidate(s) exempted by a reasoned marker.)`}`,
  );
  emit(ordered, flags, `columns ${arg === "" ? "(all tables)" : arg}`);
}

/** `columns --all`: per-table sectioning — every table's flagged columns listed, or a one-line "healthy"
 *  collapse for a table with none. `columns` bare already audits every table but flattens the result into
 *  one class-ordered list; this answers "which TABLES need a look" instead of forty manual per-table runs. */
function printColumnsPerTable(
  tables: readonly TableDef[],
  flagged: readonly ColumnCandidate[],
  producerless: readonly ProducerlessTableCandidate[],
  flags: Flags,
): void {
  const byTable = new Map<string, ColumnCandidate[]>();
  for (const c of flagged) {
    byTable.set(c.column.tableKey, [...(byTable.get(c.column.tableKey) ?? []), c]);
  }
  let withFindings = 0;
  for (const table of tables) {
    const rows = byTable.get(table.key) ?? [];
    const tableCandidate = producerless.find((candidate) => candidate.table.key === table.key);
    if (rows.length === 0 && tableCandidate === undefined) {
      narrate(flags, `  ${table.sqlName} (${table.varName}): healthy — 0 of ${table.columns.length} column(s) flagged`);
      continue;
    }
    withFindings += 1;
    narrate(
      flags,
      `  ${table.sqlName} (${table.varName}): ${tableCandidate === undefined ? "" : "producerless table + "}${rows.length} of ${table.columns.length} column(s) flagged`,
    );
    if (tableCandidate !== undefined) {
      const hit = producerlessTableHit(tableCandidate);
      narrate(flags, `    ${hit.file}:${hit.line}  [${hit.kind}]  ${hit.text}`);
    }
    for (const c of rows) {
      const h = columnHit(c);
      narrate(flags, `    ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
    }
  }
  narrate(flags, `columns --all: swept ${tables.length} table(s), ${withFindings} carrying a finding.`);
}
