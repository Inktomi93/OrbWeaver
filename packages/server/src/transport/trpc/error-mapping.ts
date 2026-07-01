// transport/trpc/error-mapping — the pure `DomainError → tRPC code` classifier (core/Tier-4-Transport.md
// §"error-mapping.ts" + Esoteric #3). NO `t`, NO middleware context, NO router state, so it is tested in
// isolation against every `@orb/kit/errors` subclass without standing up the ladder (Invariant #5: one
// case per subclass; a new subclass = one branch HERE + one test).
//
// It walks the `.cause` chain (not a single deref): the day a tx-wrapper or any re-wrap layers over the
// original throw, a single deref would turn a `DomainError` into a 500 — the cause-walk survives
// arbitrarily deep wrapping. ORDER is load-bearing: `DomainNoCredentialError` (→ PRECONDITION_FAILED) is
// checked BEFORE `DomainOperationError` (→ BAD_REQUEST) so a NoCredential never falls into the generic
// 400 bucket; the typed `cause` is preserved so the client banner can read `provider`/`msBeforeNext`.

import {
  DomainConflictError,
  DomainError,
  DomainForbiddenError,
  DomainNoCredentialError,
  DomainNotFoundError,
  DomainOperationError,
  DomainRateLimitError,
  DomainUnavailableError,
} from "@orb/kit/errors";
import { TRPCError } from "@trpc/server";

/**
 * Walk the (possibly wrapped) error chain, find a `DomainError`, and return the mapped `TRPCError`.
 * Returns `null` when no domain class is found at any depth — the caller leaves the original error alone
 * (tRPC surfaces it as `INTERNAL_SERVER_ERROR`, the correct outcome for a genuine bug).
 */
export function classifyDomainError(err: unknown): TRPCError | null {
  // Step into the chain: `err` is typically a `TRPCError` whose `.cause` is the original throw; if `err`
  // is already a `DomainError` (no wrap), the `?? err` falls through to it.
  let cause: unknown = (err as { cause?: unknown })?.cause ?? err;
  const seen = new Set<unknown>();
  while (
    cause instanceof Error &&
    !(cause instanceof DomainError) &&
    cause.cause &&
    !seen.has(cause)
  ) {
    seen.add(cause);
    cause = cause.cause;
  }
  if (cause instanceof DomainNotFoundError) {
    return new TRPCError({ code: "NOT_FOUND", message: cause.message, cause });
  }
  if (cause instanceof DomainConflictError) {
    return new TRPCError({ code: "CONFLICT", message: cause.message, cause });
  }
  if (cause instanceof DomainForbiddenError) {
    return new TRPCError({ code: "FORBIDDEN", message: cause.message, cause });
  }
  // BEFORE DomainOperationError — a NoCredential must not collapse into the generic BAD_REQUEST bucket.
  if (cause instanceof DomainNoCredentialError) {
    return new TRPCError({ code: "PRECONDITION_FAILED", message: cause.message, cause });
  }
  if (cause instanceof DomainOperationError) {
    return new TRPCError({ code: "BAD_REQUEST", message: cause.message, cause });
  }
  if (cause instanceof DomainRateLimitError) {
    return new TRPCError({ code: "TOO_MANY_REQUESTS", message: cause.message, cause });
  }
  if (cause instanceof DomainUnavailableError) {
    return new TRPCError({ code: "SERVICE_UNAVAILABLE", message: cause.message, cause });
  }
  return null;
}
