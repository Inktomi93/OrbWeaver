// `useGatedQuery` (UI-Primitives §13.1): the type-safe conditional query — a null/undefined id
// yields `skipToken` (the key is never built, nothing can hit the server), killing neo's
// `castId<X>("")` fake-disabled sentinel (~10 sites; if the `enabled:` guard was ever dropped the
// empty id reached the server — UI-Gates §11.5, gate `no-fake-disabled-id`). Caveat carried from
// the docs mine: `refetch()` does not work on a skipped query (no queryFn) — a caller needing
// imperative refetch keeps the query enabled and gates upstream.

import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import { skipToken, useQuery } from "@tanstack/react-query";

type GatedOptions<TData> = Pick<
  UseQueryOptions<TData, Error, TData, readonly unknown[]>,
  "queryKey" | "queryFn" | "staleTime" | "gcTime" | "meta" | "select" | "placeholderData"
>;

/** The stable "disabled" key — one constant so gated-off queries share a single inert cache slot. */
const GATED_OFF_KEY = ["__gated__", "off"] as const;

/**
 * `useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }))` — the options
 * builder runs ONLY when the id is present, so it receives a non-null id and the tRPC proxy's
 * branded-input typing holds end-to-end. ONE `useQuery` call site (rules-of-hooks: the gate lives
 * in the options expression, never in a conditional hook).
 */
export function useGatedQuery<TId, TData>(
  id: TId | null | undefined,
  optionsFor: (id: TId) => GatedOptions<TData>,
): UseQueryResult<TData> {
  return useQuery<TData, Error, TData, readonly unknown[]>(
    id === null || id === undefined
      ? { queryKey: GATED_OFF_KEY, queryFn: skipToken }
      : optionsFor(id),
  );
}
