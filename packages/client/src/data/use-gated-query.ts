// `useGatedQuery` (UI-Primitives §13.1): the type-safe conditional query — a null/undefined id
// yields `skipToken` (the key is never built, nothing can hit the server), killing neo's
// `castId<X>("")` fake-disabled sentinel (~10 sites; if the `enabled:` guard was ever dropped the
// empty id reached the server — UI-Gates §11.5, gate `no-fake-disabled-id`). Caveat carried from
// the docs mine: `refetch()` does not work on a skipped query (no queryFn) — a caller needing
// imperative refetch keeps the query enabled and gates upstream.
//
// TKey/TError fix (W1-1): `GatedOptions`/`useGatedQuery` are parametrized over the query-key AND
// error type instead of pinning them to `readonly unknown[]` / `Error`. tRPC's `.queryOptions()`
// returns a key typed `DataTag<TRPCQueryKey, TData, TError>` (a branded tuple) and an error typed
// `TRPCClientErrorLike<...>` (which does NOT structurally satisfy `Error` — it has no `name`
// field) — and because both `queryFn` and `retry` embed those types CONTRAVARIANTLY (function
// parameter positions), a `GatedOptions<TData>` fixed at `readonly unknown[]`/`Error` rejected the
// real proxy output outright (`staleTime`/`queryFn`/`select`/`retry` "don't unify" — v5.101
// key-and-error-variant `UseQueryOptions`). Threading the caller's real `TKey`/`TError` through
// keeps `optionsFor`'s return exactly what the proxy produced, so `getQueryData`/`setQueryData`
// inference on that key stays intact end-to-end. The gated-off branch still needs ONE stable
// literal key regardless of what `TKey` turns out to be — an inert marker cache slot never
// actually read as `TData`, so casting it to `TKey` is safe (see `GATED_OFF_KEY`).
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
 * builder runs ONLY when the id is present, so it receives a non-null id and the tRPC proxy's
 * branded-input typing holds end-to-end. ONE `useQuery` call site (rules-of-hooks: the gate lives
 * in the options expression, never in a conditional hook). `TKey`/`TError` are inferred from
 * whatever `optionsFor` actually returns (a real tRPC `.queryOptions()` call carries its own
 * DataTag'd key + `TRPCClientErrorLike` error) — defaulted to `DefaultError` (the Register-resolving
 * alias — `Error` today, no `defaultError` registered) so a non-tRPC caller still infers cleanly,
 * and every factory follows §G7 uniformly if that fork lands.
 */
export function useGatedQuery<TId, TData, TError = DefaultError, TKey extends QueryKey = QueryKey>(
  id: TId | null | undefined,
  optionsFor: (id: TId) => GatedOptions<TData, TError, TKey>,
): UseQueryResult<TData, TError> {
  return useQuery<TData, TError, TData, TKey>(
    id === null || id === undefined
      ? // GATED_OFF_KEY is an inert, never-real-data marker — cast to TKey is safe (see header).
        { queryKey: GATED_OFF_KEY as unknown as TKey, queryFn: skipToken }
      : optionsFor(id),
  );
}
