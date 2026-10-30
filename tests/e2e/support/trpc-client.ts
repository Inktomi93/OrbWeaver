import { TRPC_BATCH_MAX_ITEMS } from "@orb/contracts/rpc";
import type { AppRouter } from "@orb/server";
import type { TRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

/** The public native client preserves the router's serialized output types. */
export type TrpcClient = TRPCClient<AppRouter>;

/** Bind the native transport without importing a runner's default host, data, or authentication configuration. */
export function createTrpcClient(baseUrl: string, headers: Readonly<Record<string, string>> = {}): TrpcClient {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/api/trpc`,
        maxItems: TRPC_BATCH_MAX_ITEMS,
        headers: ({ opList }) => (opList[0].type === "mutation" ? { ...headers, "content-type": "application/json" } : headers),
        fetch: async (url, init) => {
          const response = await fetch(url, init === undefined ? undefined : { ...init, signal: init.signal ?? null });
          if (!response.ok) {
            throw new Error(
              `e2e trpc: ${url instanceof Request ? url.url : String(url)} ${init?.method ?? "GET"} failed (${String(response.status)}): ${await response.text()}`,
            );
          }
          return response;
        },
      }),
    ],
  });
}
