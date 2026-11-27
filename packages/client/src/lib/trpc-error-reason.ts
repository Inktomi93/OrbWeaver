// The refusal code off a tRPC error: the transport formatter carries a domain error's `code` on `data.reason`
// (`transport/trpc/error-mapping.ts`), and a coded refusal's stated facts on `data.detail`. Clients key on those
// structured fields, never on message text.

import type { RefusalReason } from "@orb/contracts/refusal";
import { isRefusalReason } from "@orb/contracts/refusal";
import { CancelledError } from "@tanstack/react-query";
import { isTRPCClientError } from "@trpc/client";

/** Absorb a tRPC failure that has already reached its surface, or a query read TanStack cancelled, and rethrow every
 *  other throw. Every entity mutation names its failure surface, so its `mutateAsync` rejection was already toasted,
 *  logged or stated inline; a query's failure sits in the cache's error state (client-architecture-state-and-gates.md
 *  §11); and the client's loggerLink (`data/trpc.ts`) logs every failed query or mutation settlement. A mutation's
 *  `cancelQueries` reverts a first fetch that has no data yet by rejecting it with `CancelledError`, which is the cache
 *  retiring the read, not a fault. A throw of any other kind is a fault in the caller's own follow-up, and rethrowing it
 *  lets the unhandled-rejection ring record it. */
export function rethrowUnlessTrpcFailure(error: unknown): undefined {
  if (!(isTRPCClientError(error) || error instanceof CancelledError)) {
    throw error;
  }
}

function errorData(error: unknown): unknown {
  return typeof error === "object" && error !== null && "data" in error ? error.data : null;
}

/** The refusal reason off a tRPC error's `data.reason`, or `null` when the error carries none or a reason no contract
 *  declares (a reason only a server domain names is one no client branch can read). */
export function trpcErrorReason(error: unknown): RefusalReason | null {
  const data = errorData(error);
  const reason = typeof data === "object" && data !== null && "reason" in data && typeof data.reason === "string" ? data.reason : null;
  return reason !== null && isRefusalReason(reason) ? reason : null;
}

/** The server's sentence on a tRPC error, else `null`. The transport formatter only lets through copy written for the
 *  reader (a mapped refusal's message or the fixed fault sentence), so a surface may print it as the reason. */
export function trpcErrorMessage(error: unknown): string | null {
  const message = typeof error === "object" && error !== null && "message" in error ? error.message : null;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}

/** The tRPC error code (`CONFLICT`, `BAD_REQUEST`, …) off `data.code`, else `undefined` for any other value. */
export function trpcErrorCode(error: unknown): string | undefined {
  const data = errorData(error);
  return typeof data === "object" && data !== null && "code" in data && typeof data.code === "string" ? (data as { code: string }).code : undefined;
}

function detailValue(error: unknown, key: string): unknown {
  const data = errorData(error);
  const detail = typeof data === "object" && data !== null && "detail" in data ? data.detail : null;
  return typeof detail === "object" && detail !== null && key in detail ? (detail as Record<string, unknown>)[key] : null;
}

/** One string fact a coded refusal states on `data.detail`, else `null`. */
export function trpcErrorDetailString(error: unknown, key: string): string | null {
  const value = detailValue(error, key);
  return typeof value === "string" ? value : null;
}

/** One numeric fact a coded refusal states on `data.detail`, else `null`. */
export function trpcErrorDetailNumber(error: unknown, key: string): number | null {
  const value = detailValue(error, key);
  return typeof value === "number" ? value : null;
}

/** Whether a coded refusal states `key` as true on `data.detail`. */
export function trpcErrorDetailFlag(error: unknown, key: string): boolean {
  return detailValue(error, key) === true;
}
