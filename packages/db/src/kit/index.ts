// @orb/db/kit — db-layer primitives that need drizzle types (so NOT @orb/kit-pure). Front door for the
// batch tuple bridge, the unified constraint classifier, the owner-scoped fetch, the bound-variable
// chunker, and the JSON read-seam parsers.

export type { AwaitableBatchStmt, BatchStmt, DbBatchInput } from "./batch.ts";
export { batchMany, batchStmt } from "./batch.ts";
export { checkList } from "./check-list.ts";
export type { ConstraintKind, ConstraintViolation } from "./db-errors.ts";
export { CONSTRAINT_KINDS, isConstraintViolation } from "./db-errors.ts";
export type { OwnedColumns, OwnedTable } from "./fetch-owned.ts";
export { fetchOwned } from "./fetch-owned.ts";
export { chunkRows, rowsPerInsert } from "./insert-chunk.ts";
export { parseRecord, parseStringArray, parseStringArrayColumn } from "./parsers.ts";
