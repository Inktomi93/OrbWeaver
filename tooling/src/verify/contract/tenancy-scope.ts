/** The derived facts one `sqliteTable(...)` declaration exposes — read off the shared `drizzleSchemaFact`
 * model instead of a second hand-rolled AST walk over the raw column object literal. */
export interface TableShape {
  readonly hasOwnerId: boolean;
  readonly hasChatId: boolean;
  readonly fkCount: number;
}

/** How a caller's tenancy reaches a row. The classes are ordered strongest-predicate first; a table that
 * satisfies two takes the one whose predicate an authorization check actually spells. */
/** Carries `ownerId` · `chat_participants` membership · pure link · FK-inherited · system/global. */
const SCOPING_CLASSES = ["ownerId", "membership", "junction", "parent", "global"] as const;
export type ScopingClass = (typeof SCOPING_CLASSES)[number];

/** One registry row: the SQL table name as a VALUE, its class, and the mandatory reason. Deliberately not
 * a reusable "exemption" shape (the own-tables-only `OwnershipRuling` precedent): this decides whether a
 * table's scope predicate IS what the row says, never whether an existing finding is suppressed. */
export interface ScopingRow {
  readonly table: string;
  readonly scope: ScopingClass;
  readonly why: string;
}
