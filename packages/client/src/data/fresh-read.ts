import type { QueryClient, QueryExecuteOptions, QueryKey } from "@tanstack/react-query";

/** Decision previews read through the cache because the user acts on the current count. */
export function readFresh<TQueryFnData, TError, TData = TQueryFnData, TQueryData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
  client: QueryClient,
  options: QueryExecuteOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
): Promise<TData> {
  return client.query({ ...options, staleTime: 0 });
}
