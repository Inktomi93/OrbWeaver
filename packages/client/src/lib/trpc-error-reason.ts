// The refusal code off a tRPC error: the transport formatter carries a domain error's `code` on `data.reason`
// (`transport/trpc/error-mapping.ts`), and a coded refusal's stated facts on `data.detail`. Clients key on those
// structured fields, never on message text.

function errorData(error: unknown): unknown {
  return typeof error === "object" && error !== null && "data" in error ? (error as { data: unknown }).data : null;
}

/** The refusal reason off a tRPC error's `data.reason`, else `""`. */
export function trpcErrorReason(error: unknown): string {
  const data = errorData(error);
  return typeof data === "object" && data !== null && "reason" in data && typeof (data as { reason: unknown }).reason === "string"
    ? (data as { reason: string }).reason
    : "";
}

/** One numeric fact a coded refusal states on `data.detail`, else `null`. */
export function trpcErrorDetailNumber(error: unknown, key: string): number | null {
  const data = errorData(error);
  const detail = typeof data === "object" && data !== null && "detail" in data ? (data as { detail: unknown }).detail : null;
  const value = typeof detail === "object" && detail !== null && key in detail ? (detail as Record<string, unknown>)[key] : null;
  return typeof value === "number" ? value : null;
}
