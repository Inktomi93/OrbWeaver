// batch — the `Db.batch` tuple bridge. drizzle types `batch()` as a non-empty readonly tuple of
// `BatchItem<'sqlite'>` (`[U, ...U[]]`); the insert/update builders callers compose don't structurally
// match that tuple without help, which is why neo-tavern had ~59 inline `as BatchItem` casts on the chat
// send path. These helpers centralize the ONE cast: build a plain array of statements, hand it to
// `batchMany`. A db-layer primitive — it bridges `Parameters<Db["batch"]>`, a drizzle type, so it cannot
// be `@orb/kit`-pure. (Legacy-Migration-and-Gaps.md §3.)

import type { Db } from "../client";

/** The exact argument `Db.batch` accepts — a non-empty, readonly tuple of sqlite batch statements. */
export type DbBatchInput = Parameters<Db["batch"]>[0];
/** One statement within a {@link DbBatchInput} (a query builder / prepared statement `batch()` accepts). */
export type BatchStmt = DbBatchInput[number];

/**
 * A single statement that is BOTH batchable (assignable to {@link BatchStmt}, so it can ride a `db.batch`)
 * AND directly awaitable to its concrete RETURNING rows `TResult` — the honest type of a drizzle query
 * builder handed to a caller UNEXECUTED yet also runnable standalone. `BatchStmt` alone erases the
 * builder's thenability + result (drizzle types a batch item as the tag-only `RunnableQuery`, so a bare
 * `await` of it trips `await-thenable`); this names the dual nature the PD-24 seam relies on
 * (markUserLeftStatement/setPendingHostStatement/buildInsertNotification: awaited inline OR handed to a
 * batch). `BatchStmt` itself stays the erased multi-table batch-INPUT type — modelling thenability THERE
 * would lie for the heterogeneous-array case.
 */
export type AwaitableBatchStmt<TResult> = BatchStmt & PromiseLike<TResult>;

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
