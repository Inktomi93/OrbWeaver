// The tRPC wiring (UI-Arch §2.1 `data/`): the typed client + the React context + the options
// proxy. The proxy IS the queryKey/queryFn factory — every read key in the app is
// `trpc.<router>.<proc>.queryOptions(...)`/`.queryKey(...)` (gate `no-array-literal-querykey`);
// hand-written key arrays are banned. `AppRouter` is a TYPE-ONLY import (`@orb/server` is a
// devDependency — runtime client→server is unresolvable, the cake).

import { CSRF_HEADER } from "@orb/contracts/identity";
// biome-ignore lint/correctness/noUndeclaredDependencies: type-only import from the devDependency (the sanctioned client↔server contract seam — UI-Gates §11.3 `client ⇏ @orb/server` physics is about RUNTIME imports).
import type { AppRouter } from "@orb/server";
import type { QueryClient } from "@tanstack/react-query";
import type { TRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { createTRPCContext, createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

/** The one mount path (mirrors `entry/app.ts` TRPC_ENDPOINT). */
const TRPC_URL = "/api/trpc";

/** The typed options proxy — pass around as `Trpc`; it is the app-wide key factory. */
export type Trpc = TRPCOptionsProxy<AppRouter>;

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

/**
 * The wire client. Two links behind a split: subscriptions ride SSE (`httpSubscriptionLink` —
 * native EventSource; cookies flow same-origin, and subscriptions are CSRF-exempt by design,
 * Tier-4 §7.1), everything else batches over HTTP with the custom CSRF header on EVERY request
 * (`SameSite=Lax` + this header is the whole CSRF story — the server gate 403s a cookie-authed
 * mutation without it).
 */
export function createTrpcClient(url: string = TRPC_URL): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      splitLink({
        condition: (op) => op.type === "subscription",
        true: httpSubscriptionLink({ url }),
        false: httpBatchLink({ url, headers: () => ({ [CSRF_HEADER]: "1" }) }),
      }),
    ],
  });
}

/**
 * The non-hook options proxy — for the composition root + the invalidation seam (module code that
 * can't call `useTRPC()`). Components use `useTRPC()`; both return the same shape.
 */
export function createTrpcProxy(client: TRPCClient<AppRouter>, queryClient: QueryClient): Trpc {
  return createTRPCOptionsProxy<AppRouter>({ client, queryClient });
}
