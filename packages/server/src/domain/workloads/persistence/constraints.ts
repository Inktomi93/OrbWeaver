// domain/workloads/persistence/constraints — domain-local marker predicates over the @orb/db/kit cause-walk
// classifier. The workloads table's only unique indexes are the THREE single-active locks — owned singular
// (`kind, owner_id, admission_key`), system singular (`kind, admission_key`, the arm that omits the column
// SQLite would not collide on) and bulk (`kind, admission_key`) — so a "unique" classification on a
// workloads INSERT can only be a single-active collision (a PK dup or FK violation classifies before
// "unique"). THAT EXHAUSTIVENESS IS LOAD-BEARING, not trivia: `verbs/start`'s `adoptActive` arm reads a
// "unique" verdict as "some active row holds this slot" and goes looking for it, so an index outside this
// set would send it hunting for a row that does not exist. Adding one means revisiting that arm.

import { isConstraintViolation } from "@orb/db/kit";

export function isActiveKindUniqueViolation(err: unknown): boolean {
  return isConstraintViolation(err)?.kind === "unique";
}

export function isOwnerForeignKeyViolation(err: unknown): boolean {
  return isConstraintViolation(err)?.kind === "foreign-key";
}
