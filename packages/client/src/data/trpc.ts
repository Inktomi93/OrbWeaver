// The tRPC wiring (UI-Arch §2.1 `data/`): the typed client + the React context + the options
// proxy. The proxy IS the queryKey/queryFn factory — every read key in the app is
// `trpc.<router>.<proc>.queryOptions(...)`/`.queryKey(...)` (gate `no-array-literal-querykey`);
// hand-written key arrays are banned. `AppRouter` is a TYPE-ONLY import (`@orb/server` is a
// devDependency — runtime client→server is unresolvable, the cake).

import { CSRF_HEADER } from "@orb/contracts/identity";
import type { AppRouter } from "@orb/server";
import type { QueryClient } from "@tanstack/react-query";
import type { TRPCClient, TRPCClientErrorLike } from "@trpc/client";
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, loggerLink, splitLink } from "@trpc/client";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { createTRPCContext, createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { formatTrpcOp, IS_DEV } from "#lib";

/** The one mount path (mirrors `entry/app.ts` TRPC_ENDPOINT). */
const TRPC_URL = "/api/trpc";

/** The typed options proxy — pass around as `Trpc`; it is the app-wide key factory. */
export type Trpc = TRPCOptionsProxy<AppRouter>;

/**
 * The error a tRPC read/write hands up, over THIS router — the `TError` half of a `UseQueryResult`.
 *
 * It exists because the biome `useExplicitReturnType` rule and the real client type collide: a hook that
 * returns a tRPC query result must annotate its signature, and `UseQueryResult<T>` DEFAULTS `TError` to
 * `Error` — which `TRPCClientErrorLike` does not satisfy (it is an INTERFACE with no `name`; measured: tsc
 * TS2322, the same measurement `features/preset/lib/resolve-failure.ts` records for its `ReadFailure` prop).
 * So the alternative to this alias is every feature hook RE-SPELLING the router's error shape inline, which
 * §5.4 forbids. One home, derived off `AppRouter`.
 */
export type TrpcReadError = TRPCClientErrorLike<AppRouter>;

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

/**
 * The wire client. Two links behind a split: subscriptions ride SSE (`httpSubscriptionLink` —
 * native EventSource; cookies flow same-origin, and subscriptions are CSRF-exempt by design,
 * Tier-4 §7.1), everything else batches over HTTP with the custom CSRF header on EVERY request
 * (`SameSite=Lax` + this header is the whole CSRF story — the server gate 403s a cookie-authed
 * mutation without it).
 *
 * The `[trpc]` console channel (the loggerLink) sits in the query/mutation branch ONLY — the
 * splitLink routes subscriptions AWAY from it BY DESIGN: their per-data-event lines (one per
 * streaming delta, hundreds per turn) would bury everything else, and StrictMode's dev
 * double-mount would double-log every chat-stream subscribe. Consequence: subscription ERRORS
 * never reach the console either — `useSubscription` `onError` surfaces (toast/reconnect) own
 * those. Enabled: every op in DEV; in PROD only error settlements log (via `formatTrpcOp`'s
 * console.error red-badge line). `colorMode:'css'` matches the formatter's `%c` styling.
 *
 * `httpBatchLink` — NOT `httpBatchStreamLink` — is a DELIBERATE, probed choice (2026-08-02), not
 * un-migrated legacy. The stream link's per-response flushing on mixed-speed batches is real, but it
 * costs two things on THIS stack:
 *   1. It silently kills `responseMeta`'s error visibility. The tRPC server's jsonl branch (11.18.0,
 *      the pinned version) calls `initResponse({ …, errors: [] })` — hardcoded empty, because the head
 *      is flushed before any procedure resolves (`resolveResponse`, the
 *      `info.accept === "application/jsonl"` branch). Our
 *      `entry/app.ts` mounts `responseMeta: ({ errors }) => rateLimitResponseMeta(errors)`, so
 *      `Retry-After` + `X-RateLimit-Remaining` would stop being sent on EVERY rate-limited response —
 *      and no test would go red for it: `app.test.ts` calls `rateLimitResponseMeta` directly with a
 *      populated array, so the unit stays green while the wire header disappears.
 *   2. It breaks the whole CT data layer. The link sends `trpc-accept: application/jsonl` and feeds
 *      `res.body` to `jsonlStreamConsumer` with NO plain-JSON fallback on a 2xx; the CT network stub
 *      (`tests/support/node/route-trpc.ts`) fulfills a plain JSON array. Probed by swapping it in:
 *      3/3 of `tests/client/data/query-boundary.ct.tsx` failed with "Stream closed before head was
 *      received" — i.e. every client CT that drives a query, until the stub grows a jsonl producer.
 * Revisit only with both addressed; the CSRF header itself is fine (identical `headers` seam).
 */
export function createTrpcClient(url: string = TRPC_URL): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      splitLink({
        condition: (op) => op.type === "subscription",
        true: httpSubscriptionLink({ url }),
        false: [
          loggerLink({
            enabled: (op) => IS_DEV || (op.direction === "down" && op.result instanceof Error),
            logger: formatTrpcOp,
            colorMode: "css",
          }),
          httpBatchLink({ url, headers: () => ({ [CSRF_HEADER]: "1" }) }),
        ],
      }),
    ],
  });
}

/**
 * The non-hook options proxy — production always gets its `Trpc` via `useTRPC()` inside
 * `TRPCProvider`'s context (e.g. `useInvalidation`); this is the headless equivalent for node-lane
 * tests that build a `Trpc` outside a React render (`invalidation.test.ts`). Same return shape as
 * `useTRPC()`.
 */
export function createTrpcProxy(client: TRPCClient<AppRouter>, queryClient: QueryClient): Trpc {
  return createTRPCOptionsProxy<AppRouter>({ client, queryClient });
}
