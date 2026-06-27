// batch — the `Db.batch` tuple bridge. drizzle types `batch()` as a non-empty readonly tuple of
// `BatchItem<'sqlite'>` (`[U, ...U[]]`); the insert/update builders callers compose don't structurally
// match that tuple without help, which is why neo-tavern had ~59 inline `as BatchItem` casts on the chat
// send path. These helpers centralize the ONE cast: build a plain array of statements, hand it to
// `batchMany`. A db-layer primitive — it bridges `Parameters<Db["batch"]>`, a drizzle type, so it cannot
// be `@orb/kit`-pure. (shared-dissolution.md §3.)

import type { Db } from "../client";

/** The exact argument `Db.batch` accepts — a non-empty, readonly tuple of sqlite batch statements. */
export type DbBatchInput = Parameters<Db["batch"]>[0];
/** One statement within a {@link DbBatchInput} (a query builder / prepared statement `batch()` accepts). */
export type BatchStmt = DbBatchInput[number];

/** Identity-typed pass-through that pins a single statement to {@link BatchStmt} at the build site. */
export function batchStmt(stmt: BatchStmt): BatchStmt {
  return stmt;
}

/**
 * Bridge a plain array of statements into the non-empty tuple `Db.batch` wants — the ONE sanctioned
 * cast (the array's non-emptiness is the caller's invariant; `batch()` itself rejects an empty list at
 * runtime). Replaces the scattered inline `as BatchItem[]` casts.
 */
export function batchMany(stmts: readonly BatchStmt[]): DbBatchInput {
  return stmts as unknown as DbBatchInput;
}
