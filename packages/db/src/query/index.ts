// @orb/db/query — db-layer primitives that need drizzle types (so NOT @orb/kit-pure). Front door for the
// batch tuple bridge, the unified constraint classifier, the owner-scoped fetch, the member-visible chat
// scope + recency clock, the bound-variable chunker, the LIKE-term escape, and the JSON read-seam parsers.

export type { AwaitableBatchStmt, BatchStmt } from "./batch.ts";
export { batchMany, batchStmt } from "./batch.ts";
export { chatRecencyExpr, memberVisibleChatScope } from "./chat-visibility.ts";
export { isConstraintViolation } from "./db-errors.ts";
export { fetchOwned } from "./fetch-owned.ts";
export { immutableCollection, ROW_TUPLE_ALIAS, rowTuple } from "./immutable-rows.ts";
export { chunkRows, rowsPerInsert } from "./insert-chunk.ts";
export { escapeLikeTerm } from "./like.ts";
export { parseRecord, parseStringArray, parseStringArrayColumn } from "./parsers.ts";
