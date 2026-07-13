// domain/workloads/persistence/constraints — domain-local marker predicates over the @orb/db/kit cause-walk
// classifier. The workloads table's only unique indexes are the two single-active locks, so a "unique"
// classification on a workloads INSERT can only be a single-active collision (a PK dup or FK violation
// classifies before "unique").

import { isConstraintViolation } from "@orb/db/kit";

export function isActiveKindUniqueViolation(err: unknown): boolean {
  return isConstraintViolation(err)?.kind === "unique";
}

export function isOwnerForeignKeyViolation(err: unknown): boolean {
  return isConstraintViolation(err)?.kind === "foreign-key";
}
