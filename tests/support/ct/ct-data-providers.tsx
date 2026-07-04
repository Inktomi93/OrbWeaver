// CtDataProviders — the CLIENT data-layer provider stack (Query + tRPC) for client `.ct.tsx`
// lanes; composed by `_ct-stories.tsx` modules around their story root. Deliberately NOT stacked
// in ct-providers.tsx / beforeMount: packages/ui/tsconfig.json owns ct-providers.tsx + playwright/**
// in its DOM-only program, and ANY import path from there to @orb/client drags @orb/server types
// upward through the cake (typecheck explosion). Story modules belong to the CLIENT program, so
// the seam lives here — one home, client-side (UI-Primitives §13.7 provider doctrine, client half).
//
// Fresh QueryClient PER MOUNT (this component re-runs per `mount()`) → an isolated cache per test.
// `retry: false` so a scripted failure surfaces immediately (the production retry:2 would triple
// every fail-then-succeed script). The tRPC client is the REAL production wiring (createTrpcClient:
// splitLink → httpBatchLink + CSRF header) — routeTrpc stubs the NETWORK under it, so CT exercises
// the real links / query keys / serialization.
//
// NO store-reset / localStorage.clear here: Playwright CT gives every test a FRESH browser context,
// so module state, zustand stores, and localStorage all start clean. If a future lane ever reuses a
// page across tests, the per-mount reset belongs HERE.

import { createTrpcClient, TRPCProvider } from "@orb/client/data";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

export function CtDataProviders({ children }: { readonly children: ReactNode }): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  const trpcClient = createTrpcClient();
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
