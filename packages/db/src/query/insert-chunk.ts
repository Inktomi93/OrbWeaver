// insert-chunk — the libSQL bound-variable cap, made safe. A single prepared statement may bind at
// most 32766 variables (the SQLITE_MAX_VARIABLE_NUMBER libSQL ships with). A bulk insert of
// `rows × columnsPerRow` placeholders blows that cap silently past the limit, so callers that batch
// rollups (`discovery`, `stats`) chunk their rows through `chunkRows` first. A db-layer primitive (the
// cap is a libSQL fact, cross-feature) — NOT a domain helper.

const SQLITE_MAX_BOUND_VARS = 32_766;
const MIN_ROWS_PER_INSERT = 1;

// How many rows fit in one insert given `columnsPerRow` bound variables each. Private: a caller that passed its
// result to `chunkRows` got chunks of about `columnsPerRow` rows, so `chunkRows` is the only door.
// A column count that is not a positive integer throws: clamping a NaN made one empty chunk and no error,
// which reads to the caller as nothing to insert.
function rowsPerInsert(columnsPerRow: number): number {
  if (!Number.isInteger(columnsPerRow) || columnsPerRow < 1) {
    throw new RangeError(`rowsPerInsert: columnsPerRow must be a positive integer, got ${columnsPerRow}`);
  }
  return Math.max(MIN_ROWS_PER_INSERT, Math.floor(SQLITE_MAX_BOUND_VARS / columnsPerRow));
}

/** Split `rows` into chunks each safely under the bound-variable cap, given how many variables one row binds.
 *  @throws RangeError when `columnsPerRow` is not a positive integer; never an empty chunk. */
export function chunkRows<T>(rows: readonly T[], columnsPerRow: number): T[][] {
  const size = rowsPerInsert(columnsPerRow);
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}
