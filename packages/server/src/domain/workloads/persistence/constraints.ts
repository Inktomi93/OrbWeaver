// domain/workloads/persistence/constraints — the domain-LOCAL marker predicate over the unified
// `@orb/db/kit` cause-walk classifier (db/kit owns the 4-depth `error.cause` walk; the kind-active marker
// check is domain-specific and stays HERE). `isActiveKindUniqueViolation` answers "did this INSERT collide with
// the `workloads_kind_active` partial unique index?" — used by `start`/`retry` to translate the conflict to
// `DomainConflictError`.
//
// WHY `kind === "unique"` is the exact marker: the `workloads` table's ONLY unique INDEXes are the TWO
// single-active locks (the per-owner `workloads_kind_active_user` + the global `workloads_kind_active_deployment`,
// F3 — a row is covered by exactly one, so a `unique` violation is unambiguously "the slot is taken"); a PK
// dup on `id` classifies as `primary-key` and an FK violation on `ownerId` as `foreign-key` (the classifier
// checks those BEFORE `unique`). So a `unique` classification on a workloads INSERT can ONLY be a single-active
// collision — and a future FK-on-`ownerId` violation is NOT swallowed as "already active" (the marker guards this).

import { isConstraintViolation } from "@orb/db/kit";

/** True iff `err` is the single-active collision (→ `DomainConflictError`). Reads the classifier's `kind`
 *  discriminator instead of re-walking `error.cause` (db/kit owns the walk). */
export function isActiveKindUniqueViolation(err: unknown): boolean {
  return isConstraintViolation(err)?.kind === "unique";
}

/** True iff `err` is the `owner_id` FK violation (→ a bulk-create `targetOwnerId` that isn't a real user; a
 *  real caller's own id always exists). Surfaced by `start` as a leak-free "user not found". */
export function isOwnerForeignKeyViolation(err: unknown): boolean {
  return isConstraintViolation(err)?.kind === "foreign-key";
}
