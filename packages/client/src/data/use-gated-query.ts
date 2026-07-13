// The type-safe conditional query: a null/undefined id yields `skipToken` (the key is never built,
// nothing can hit the server) instead of a fake-disabled empty-id sentinel. `refetch()` does not
// work on a skipped query (no queryFn) — a caller needing imperative refetch keeps it enabled and
// gates upstream. `TKey`/`TError` thread the caller's real tRPC-proxy types through (its key is a
// branded DataTag tuple and its error doesn't structurally satisfy `Error`), so a fixed
// `readonly unknown[]`/`Error` would reject the real proxy output.
import type {
  DefaultError,
  QueryKey,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { skipToken, useQuery } from "@tanstack/react-query";

type GatedOptions<TData, TError, TKey extends QueryKey> = Pick<
  UseQueryOptions<TData, TError, TData, TKey>,
  "queryKey" | "queryFn" | "staleTime" | "gcTime" | "meta" | "select" | "placeholderData"
>;

/** The stable "disabled" key — one constant so gated-off queries share a single inert cache slot. */
const GATED_OFF_KEY = ["__gated__", "off"] as const;

/**
 * `useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }))` — the options
 * builder runs ONLY when the id is present. ONE `useQuery` call site (the gate lives in the options
 * expression, never in a conditional hook).
 */
export function useGatedQuery<TId, TData, TError = DefaultError, TKey extends QueryKey = QueryKey>(
  id: TId | null | undefined,
  optionsFor: (id: TId) => GatedOptions<TData, TError, TKey>,
): UseQueryResult<TData, TError> {
  return useQuery<TData, TError, TData, TKey>(
    id === null || id === undefined
      ? { queryKey: GATED_OFF_KEY as unknown as TKey, queryFn: skipToken }
      : optionsFor(id),
  );
}
