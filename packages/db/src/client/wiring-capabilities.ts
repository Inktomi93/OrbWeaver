// Wiring carries inert identities; only admitted owners recover the original connection and statements.
import type { AwaitableBatchStmt, BatchStmt } from "../query/batch.ts";
import type { Db, ReadOnlyDb } from "./index.ts";

const DATABASE = Symbol("database-wiring-handle");
const STATEMENT = Symbol("statement-wiring-token");
const AWAITABLE = Symbol("awaitable-statement-wiring-token");
const RESULT = Symbol("statement-result-type");
const BATCH = Symbol("batch-wiring-handle");
const BOOT = Symbol("boot-wiring-handle");

export interface DatabaseHandle {
  readonly [DATABASE]: true;
}

/** The boot authority to read and write rows of every owner; a plain {@link DatabaseHandle} cannot stand in for it. */
export interface BootDatabaseHandle extends DatabaseHandle {
  readonly [BOOT]: true;
}

export interface StatementToken {
  readonly [STATEMENT]: true;
}

export interface AwaitableStatementToken<TResult> extends StatementToken {
  readonly [AWAITABLE]: true;
  readonly [RESULT]?: TResult;
}

export interface BatchHandle {
  readonly [BATCH]: true;
}

/** A public assembly input retains every canonical field except the private query capability. */
export type DbAssemblyInput<Context extends { readonly db: ReadOnlyDb }> = Omit<Context, "db"> & { readonly db: DatabaseHandle };

const databases = new WeakMap<DatabaseHandle, Db>();
const statements = new WeakMap<object, BatchStmt>();
const awaitableStatements = new WeakSet<object>();
const batches = new WeakMap<BatchHandle, BatchStmt[]>();
const bootGrants = new WeakSet<BootDatabaseHandle>();

/** Borrow the exact connection without transferring physical lifetime ownership. */
export function databaseHandle(db: Db): DatabaseHandle {
  const handle: DatabaseHandle = Object.freeze({ [DATABASE]: true as const });
  databases.set(handle, db);
  return handle;
}

/** Grant boot's cross-owner authority over an admitted connection; the `@orb/db/wiring-boot` importer rule confines who may call this. */
export function bootDatabaseHandle(handle: DatabaseHandle): BootDatabaseHandle {
  const boot: BootDatabaseHandle = Object.freeze({ [DATABASE]: true as const, [BOOT]: true as const });
  databases.set(boot, databaseForOwner(handle));
  bootGrants.add(boot);
  return boot;
}

/** Recover the connection behind a grant the mint issued; a plain handle cast to the boot type is refused here. */
export function bootDatabaseForOwner(handle: BootDatabaseHandle): Db {
  if (!bootGrants.has(handle)) {
    throw new Error("boot wiring handle is not granted");
  }
  return databaseForOwner(handle);
}

/** Recover only a connection admitted by its physical owner, never a structurally similar object. */
export function databaseForOwner(handle: DatabaseHandle): Db {
  const db = databases.get(handle);
  if (db === undefined) {
    throw new Error("database wiring handle is not registered");
  }
  return db;
}

/** Retain a native statement without exposing its builder, execution methods or thenability. */
export function statementToken(statement: BatchStmt): StatementToken {
  const token: StatementToken = Object.freeze({ [STATEMENT]: true as const });
  statements.set(token, statement);
  return token;
}

/** Retain the producer's awaitable result without making the wiring token thenable. */
export function awaitableStatementToken<TResult>(statement: AwaitableBatchStmt<TResult>): AwaitableStatementToken<TResult> {
  const token: AwaitableStatementToken<TResult> = Object.freeze({ [STATEMENT]: true as const, [AWAITABLE]: true as const });
  statements.set(token, statement);
  awaitableStatements.add(token);
  return token;
}

/** The same native statement, for the owner's existing atomic batch. */
export function statementForOwner(token: StatementToken): BatchStmt {
  const statement = statements.get(token);
  if (statement === undefined) {
    throw new Error("statement wiring token is not registered");
  }
  return statement;
}

/** Recover the result type captured by the awaitable producer's token. */
export function awaitableStatementForOwner<TResult>(token: AwaitableStatementToken<TResult>): AwaitableBatchStmt<TResult> {
  if (!awaitableStatements.has(token)) {
    throw new Error("awaitable statement wiring token is not registered");
  }
  // The private map erases the producer/result correlation; the admitted token retains that exact statement.
  return statementForOwner(token) as AwaitableBatchStmt<TResult>;
}

/** Preserve the actual mutable batch operand supplied by the operation, not a reconstructed array. */
export function batchHandle(batch: BatchStmt[]): BatchHandle {
  const handle: BatchHandle = Object.freeze({ [BATCH]: true as const });
  batches.set(handle, batch);
  return handle;
}

/** The owner appends to the original atomic operand, including when another root supplied it. */
export function batchForOwner(handle: BatchHandle): BatchStmt[] {
  const batch = batches.get(handle);
  if (batch === undefined) {
    throw new Error("batch wiring handle is not registered");
  }
  return batch;
}
