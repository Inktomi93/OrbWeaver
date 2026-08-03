// batch — the `Db.batch` tuple bridge. drizzle types `batch()` as a non-empty readonly tuple of
// `BatchItem<'sqlite'>` (`[U, ...U[]]`); the insert/update builders callers compose don't structurally
// match that tuple without help, which is why neo-tavern had ~59 inline `as BatchItem` casts on the chat
// send path. These helpers centralize the ONE cast: build a plain array of statements, hand it to
// `batchMany`. A db-layer primitive — it bridges `Parameters<Db["batch"]>`, a drizzle type, so it cannot
// be `@orb/kit`-pure. (Legacy-Migration-and-Gaps.md §3.)
//
// TRANSACTION MODE — why every batch rides `BEGIN DEFERRED`, and why that is NOT a choice made here.
// A raw `@libsql/client` batch takes a second `TransactionMode` arg (`Sqlite3Client.batch(stmts, mode)`,
// sqlite3.js:85 — "write" → `BEGIN IMMEDIATE`, "deferred" → `BEGIN DEFERRED`, @libsql/core util.js:3).
// drizzle 0.45.2 does NOT expose it: `LibSQLDatabase.batch` is declared with ONE parameter
// (libsql/driver-core.d.ts:7) and its session calls `this.client.batch(builtQueries)` with no mode
// (libsql/session.js:45), so libsql's own `mode = "deferred"` default applies to every batch we issue.
// `Parameters<Db["batch"]>` is therefore a 1-tuple and {@link batchMany} returns the ONLY argument that
// exists — there is no mode to thread. Reaching the arg would mean bypassing drizzle
// (`$client.batch(rawStmts, "write")`), which forfeits the typed `BatchResponse<T>` rows that
// {@link AwaitableBatchStmt} and the PD-24 co-statement seam are built on and re-implements drizzle's
// per-query prepare + `mapResult` inside @orb/db. Not worth it — the window it would close is:
// DEFERRED takes no lock at BEGIN, so a batch that READS before it writes must upgrade its snapshot, and
// if another writer committed in between SQLite fails it with SQLITE_BUSY_SNAPSHOT — which `busy_timeout`
// does NOT retry (it is an immediate error requiring rollback + replay, unlike plain SQLITE_BUSY).
// A pure-write batch never reads, so it takes the write lock at its first statement and IS covered by
// busy_timeout, making IMMEDIATE vs DEFERRED a no-op for it. Swept 2026-08-02: every `batchMany` call
// site in `packages/server/src` batches writes ONLY — zero read statements — so the window is currently
// unreachable. KEEP IT THAT WAY: do not batch a SELECT ahead of writes. If a drizzle bump ever surfaces
// the mode param, "write" is the right value for these batches and this note is the reason.

import type { Db } from "../client/index.ts";

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
