// The pure DomainError → tRPC code classifier. No t, no middleware context, no router state, so it is
// tested in isolation against every @orb/kit/errors subclass.
//
// Walks the .cause chain (not a single deref): a re-wrap layer over the original throw would otherwise
// turn a DomainError into a 500. Order is load-bearing: DomainNoCredentialError is checked before
// DomainOperationError so it never falls into the generic 400 bucket.

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
