import type { ScopingClass } from "@orb/db/tenancy";

/** One registry row as the tenancy readers key it: the SQL table name, its class, and the mandatory reason.
 * Deliberately not a reusable "exemption" shape (the own-tables-only `OwnershipRuling` precedent): this decides
 * whether a table's scope predicate IS what the row says, never whether an existing finding is suppressed. */
export interface ScopingRow {
  readonly table: string;
  readonly scope: ScopingClass;
  readonly why: string;
}
