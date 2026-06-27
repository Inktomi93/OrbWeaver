// insert-chunk — the libSQL bound-variable cap, made safe. A single prepared statement may bind at
// most 32766 variables (the SQLITE_MAX_VARIABLE_NUMBER libSQL ships with). A bulk insert of
// `rows × columnsPerRow` placeholders blows that cap silently past the limit, so callers that batch
// rollups (`discovery`, `stats`) chunk their rows through `chunkRows` first. A db-layer primitive (the
// cap is a libSQL fact, cross-feature) — NOT a domain helper.

// libSQL/SQLite bind a maximum of 32766 host parameters per statement.
const SQLITE_MAX_BOUND_VARS = 32_766;
// A row needs at least one column; guard against a divide that would yield Infinity/0.
const MIN_COLUMNS_PER_ROW = 1;
const MIN_ROWS_PER_INSERT = 1;

/** How many rows fit in one insert given `columnsPerRow` bound variables each (≥1, floored). */
export function rowsPerInsert(columnsPerRow: number): number {
  const cols = Math.max(MIN_COLUMNS_PER_ROW, columnsPerRow);
  return Math.max(MIN_ROWS_PER_INSERT, Math.floor(SQLITE_MAX_BOUND_VARS / cols));
}

/** Split `rows` into chunks each safely under the bound-variable cap for `columnsPerRow`. */
export function chunkRows<T>(rows: readonly T[], columnsPerRow: number): T[][] {
  const size = rowsPerInsert(columnsPerRow);
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}
