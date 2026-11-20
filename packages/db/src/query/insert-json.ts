// insert-json — a bulk insert whose rows reach SQLite as one JSON text per statement. A multi-row VALUES insert
// binds every cell, and the driver's synchronous bind is the cost of a large batch; here SQLite reads the rows
// itself (`json_each`), so a statement binds one value however many rows it carries.
//
// Each cell is the column's own driver value, so a stored row is the row a VALUES insert stores. A column whose
// driver value JSON cannot carry (a blob) and a default that is an SQL expression are refused by throwing.

import type { Column } from "drizzle-orm";
import { getTableColumns, is, SQL, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "../client/index.ts";
import type { BatchStmt } from "./batch.ts";

// Bounds one statement's text; the bound-variable cap does not apply to a single bound value.
const ROWS_PER_STATEMENT = 10_000;

type JsonCell = string | number | boolean | null;

function defaulted(column: Column): unknown {
  if (column.default !== undefined && column.default !== null) {
    if (is(column.default, SQL)) {
      throw new TypeError(`insertRowsAsJson: ${column.name} defaults to an SQL expression; pass its value`);
    }
    return column.default;
  }
  return column.defaultFn?.() ?? column.onUpdateFn?.() ?? null;
}

function cell(column: Column, value: unknown): JsonCell {
  const resolved = value === undefined ? defaulted(column) : value;
  if (resolved === null) {
    return null;
  }
  const driver: unknown = column.mapToDriverValue(resolved);
  if (driver === null || typeof driver === "string" || typeof driver === "number" || typeof driver === "boolean") {
    return driver;
  }
  throw new TypeError(`insertRowsAsJson: ${column.name} has a driver value JSON cannot carry`);
}

/**
 * Insert `rows` into `table`, one statement per {@link ROWS_PER_STATEMENT} rows, in row order. Batch the answer
 * with the rest of the atomic unit; no rows answer no statement.
 * @throws TypeError for a blob-valued column or an SQL-expression default, before any statement exists.
 */
export function insertRowsAsJson<TTable extends SQLiteTable>(db: Db, table: TTable, rows: readonly TTable["$inferInsert"][]): BatchStmt[] {
  const columns = Object.entries(getTableColumns(table));
  const stmts: BatchStmt[] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_STATEMENT) {
    const built = rows
      .slice(start, start + ROWS_PER_STATEMENT)
      .map((row: Readonly<Record<string, unknown>>): JsonCell[] => columns.map(([key, column]) => cell(column, row[key])));
    // A column every row leaves null is left out, so SQLite extracts no cell for it. One with a database default
    // stays in: left out, it would store that default where the row said null.
    const kept = columns.flatMap(([, column], index) => (column.hasDefault || built.some((row) => row[index] !== null) ? [{ column, index }] : []));
    const names = sql.join(
      kept.map(({ column }) => sql.identifier(column.name)),
      sql`, `,
    );
    // The position is inlined: a bound path is resolved again for every row.
    const cells = sql.raw(kept.map((_, position) => `value ->> '$[${String(position)}]'`).join(", "));
    const payload = JSON.stringify(built.map((row) => kept.map(({ index }) => row[index] ?? null)));
    stmts.push(db.run(sql`insert into ${table} (${names}) select ${cells} from json_each(${payload})`));
  }
  return stmts;
}
