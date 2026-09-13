/** The derived facts one `sqliteTable(...)` declaration exposes — read off the shared `drizzleSchemaFact`
 * model instead of a second hand-rolled AST walk over the raw column object literal. */
export interface TableShape {
  readonly hasOwnerId: boolean;
  readonly hasChatId: boolean;
  readonly fkCount: number;
}

/** How a caller's tenancy reaches a row. The classes are ordered strongest-predicate first; a table that
 * satisfies two takes the one whose predicate an authorization check actually spells. */
export type ScopingClass =
  /** Carries an `ownerId` column — `fetchOwned(id, principal.userId)` / an ownerId in the WHERE. */
  | "ownerId"
  /** Chat-anchored — authority is `chat_participants` membership on the row's own `chatId` (D18). */
  | "membership"
  /** A pure LINK row between two independently-scoped entities — BOTH parents must be reachable. */
  | "junction"
  /** Scope inherits ONE owning FK; the read joins up to the parent (derive-don't-stamp, D23). */
  | "parent"
  /** No tenancy: a system/global table (config, the identity root, transport state, the audit log). */
  | "global";

/** One registry row: the SQL table name as a VALUE, its class, and the mandatory reason. Deliberately not
 * a reusable "exemption" shape (the own-tables-only `OwnershipRuling` precedent): this decides whether a
 * table's scope predicate IS what the row says, never whether an existing finding is suppressed. */
export interface ScopingRow {
  readonly table: string;
  readonly scope: ScopingClass;
  readonly why: string;
}
