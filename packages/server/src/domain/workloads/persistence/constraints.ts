// domain/workloads/persistence/constraints — the domain-LOCAL marker predicate over the unified
// `@orb/db/kit` cause-walk classifier (db/kit owns the 4-depth `error.cause` walk; the kind-active marker
// check is domain-specific and stays HERE). `isActiveKindUniqueViolation` answers "did this INSERT collide with
// the `workloads_kind_active` partial unique index?" — used by `start`/`retry` to translate the conflict to
// `DomainConflictError`.
//
// WHY `kind === "unique"` is the exact marker: the `workloads` table has exactly ONE unique INDEX (the
// partial `workloads_kind_active`); a PK dup on `id` classifies as `primary-key` and an FK violation on
// `ownerId` as `foreign-key` (the classifier checks those BEFORE `unique`). So a `unique` classification on
// a workloads INSERT can ONLY be the single-active collision — and a future FK-on-`ownerId` violation is NOT
// swallowed as "already active" (the marker guards exactly this).

import { isConstraintViolation } from "@orb/db/kit";

/** True iff `err` is the `workloads_kind_active` single-active-per-kind collision (→ `DomainConflictError`).
 *  Reads the classifier's `kind` discriminator instead of re-walking `error.cause` (db/kit owns the walk). */
export function isActiveKindUniqueViolation(err: unknown): boolean {
  return isConstraintViolation(err)?.kind === "unique";
}
