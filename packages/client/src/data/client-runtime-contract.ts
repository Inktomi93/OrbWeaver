import type { IdSource } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import type { Trpc, TrpcClient } from "./trpc.ts";

/** The data instances shared by boot, authenticated contributors and their mounted providers. */
export interface ClientRuntime {
  readonly queryClient: QueryClient;
  readonly trpcClient: TrpcClient;
  readonly trpcProxy: Trpc;
  /** The business-id source for ids the client persists; a test seeds it through the runtime. */
  readonly ids: IdSource;
}
