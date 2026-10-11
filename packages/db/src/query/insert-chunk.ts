// insert-chunk — the libSQL bound-variable cap, made safe. A single prepared statement may bind at
// most 32766 variables (the SQLITE_MAX_VARIABLE_NUMBER libSQL ships with). A bulk insert of
// `rows × columnsPerRow` placeholders blows that cap silently past the limit, so callers that batch
// rollups (`discovery`, `stats`) chunk their rows through `chunkRows` first. A db-layer primitive (the
// cap is a libSQL fact, cross-feature) — NOT a domain helper.

const SQLITE_MAX_BOUND_VARS = 32_766;
const MIN_ROWS_PER_INSERT = 1;

/** How many rows fit in one insert given `columnsPerRow` bound variables each (≥1, floored).
 *
 *  `columnsPerRow` must be a POSITIVE INTEGER and throws `RangeError` otherwise (#1377 item 1). It used to
 *  clamp with `Math.max(1, columnsPerRow)`, which is `NaN` for `NaN` — and the NaN then flowed into
 *  {@link chunkRows}, where the loop ran its body once against `rows.slice(0, NaN)` (an EMPTY chunk) and
 *  `start += NaN` ended it forever. A non-empty batch produced one empty chunk and no error, which reads
 *  to the caller as "there was nothing to insert": a silently dropped bulk write. A column count this
 *  helper cannot compute is a caller bug, and this is the boundary that can still name it. */
export function rowsPerInsert(columnsPerRow: number): number {
  if (!Number.isInteger(columnsPerRow) || columnsPerRow < 1) {
    throw new RangeError(`rowsPerInsert: columnsPerRow must be a positive integer, got ${columnsPerRow}`);
  }
  return Math.max(MIN_ROWS_PER_INSERT, Math.floor(SQLITE_MAX_BOUND_VARS / columnsPerRow));
}

/** Split `rows` into chunks each safely under the bound-variable cap for `columnsPerRow`. Throws
 *  `RangeError` on a `columnsPerRow` {@link rowsPerInsert} refuses — never an empty chunk. */
export function chunkRows<T>(rows: readonly T[], columnsPerRow: number): T[][] {
  const size = rowsPerInsert(columnsPerRow);
  const chunks: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    chunks.push(rows.slice(start, start + size));
  }
  return chunks;
}
