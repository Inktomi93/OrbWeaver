// The refusal code off a tRPC error: the transport formatter carries a domain error's `code` on `data.reason`
// (`transport/trpc/error-mapping.ts`). Clients key on that structured field, never on message text.

/** The refusal reason off a tRPC error's `data.reason`, else `""`. */
export function trpcErrorReason(error: unknown): string {
  const data = typeof error === "object" && error !== null && "data" in error ? (error as { data: unknown }).data : null;
  return typeof data === "object" && data !== null && "reason" in data && typeof (data as { reason: unknown }).reason === "string"
    ? (data as { reason: string }).reason
    : "";
}
