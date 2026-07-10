// The client COMPOSITION ROOT (the entry/ mirror): constructs the singletons ONCE — QueryClient →
// tRPC client → the toast manager (the `notify` seam's render half) — and provides them to the tree.
// The tRPC options proxy + the `invalidation` seam are NOT built here; both are minted per-render at
// routes/home-page.tsx (data/use-invalidation.ts) — the live path. Nothing imports this file
// (dep-cruiser client-nothing-imports-main); everything below consumes via providers/hooks. Router
// context only FORWARDS these already-constructed singletons (never constructs —
// UI-Lib-TanStack-Router.md C#4: one DI channel, the root is it).

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc +
// vite resolve AlertTriangle/Icon fine (the same gap `#primitives/icons` hits inside packages/ui itself
// — see status-chip.tsx).
// biome-ignore lint/correctness/noUnresolvedImports: tsc-verified false positive (see above).
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { createToastManager, Toaster, ToastProvider } from "@orb/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
// biome mis-enumerates react's conditional-CJS export map and misses StrictMode/lazy/Suspense
// specifically (useState/Component/etc. resolve fine); tsc resolves them and the client
// typechecks clean.
// biome-ignore lint/correctness/noUnresolvedImports: tsc-verified false positive (see above).
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createAppQueryClient, createTrpcClient, TRPCProvider } from "#data";
import { AppErrorBoundary, bindNotify, buildClientErrorPayload } from "#lib";
import { installAgentDebugHandle, installAppReadySignal } from "./lib/agent-bridge";
import { router } from "./routes/router";
import "./styles/globals.css";

// ── Dev instrumentation (T5) — both arms behind the LITERAL `import.meta.env.DEV`, which the
// bundler constant-folds so NEITHER module (nor the devtools packages) lands in the prod output.
// [perf] main-thread half: dynamic import keeps the tracer out of the entry chunk even in dev.
if (import.meta.env.DEV) {
  void import("./lib/long-task-tracer").then(({ installLongTaskTracer }) => {
    installLongTaskTracer();
  });
}
// Framework devtools shell (Query + Router panels): lazy + dead-branch. Deep import ON PURPOSE —
// dev-tools must never ride a barrel that also exports prod code (the barrel-leak failure mode).
const DevTools = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import("./lib/dev-tools");
      return { default: mod.DevTools };
    })
  : null;

// vite:preloadError recovery (client-tooling-setup §9). A redeploy rotates hashed chunk names; an old
// tab that then lazy-imports a route (e.g. /admin/*) requests a hash that no longer exists → a failed
// dynamic import white-screens the app. Soft-reload ONCE to pull the new index — the sessionStorage
// guard stops a genuinely-missing chunk from reload-looping.
const PRELOAD_RELOAD_FLAG = "orb:preload-reloaded";
globalThis.addEventListener("vite:preloadError", () => {
  if (globalThis.sessionStorage.getItem(PRELOAD_RELOAD_FLAG) !== null) {
    return;
  }
  globalThis.sessionStorage.setItem(PRELOAD_RELOAD_FLAG, "1");
  globalThis.location.reload();
});

// ── The singleton graph (constructed once, at module scope — the stable-query-client discipline) ──
const queryClient = createAppQueryClient();
const trpcClient = createTrpcClient();

// ── The render half of the `notify` seam (lib/notify.ts): the app-wide toast manager, minted OUTSIDE
// React (createToastManager) so it binds ONCE here at the composition root and the `<ToastProvider>`
// below renders whatever `notify.*` enqueues. Every user-facing error — the D54 QueryCache/MutationCache
// `errorToast` channel (data/query-client.ts) + the SSE `__subscriptionError` frame (use-chat-bus.ts) —
// terminates in `notify`, so without this bind they were console-only. `add` returns an id we discard;
// the seam is fire-and-forget (Notify returns void). `error` announces urgently (priority high); success
// tints the border via `type` (toast/variants.ts `data-type`).
const toastManager = createToastManager();
bindNotify({
  info: (message): void => {
    toastManager.add({ title: message });
  },
  success: (message): void => {
    toastManager.add({ title: message, type: "success" });
  },
  error: (message): void => {
    toastManager.add({ title: message, type: "error", priority: "high" });
  },
});

// ── PD-58: the app-level error boundary — `trpcClient` already exists at module scope here (the ONE
// place outside a component that holds it), so the report callback needs no hook/context plumbing.
// Fire-and-forget: `.catch()` swallows a failed report rather than compounding the crash it describes.
function reportClientError(error: Error, ownerStack: string | null): void {
  const url = `${globalThis.location.pathname}${globalThis.location.search}`;
  trpcClient.clientError.mutate(buildClientErrorPayload(error, ownerStack, url)).catch(() => {
    // A failed error REPORT must never itself throw — there is nowhere left to report that to.
  });
}

// The crash fallback JSX is inlined directly into `renderFallback` below (not its own top-level
// function) — this entry module is a side-effecting root (nothing imports it,
// client-nothing-imports-main) and a named top-level component definition here would collide with the
// "a module exports either components only, or none" Fast-Refresh discipline. Full-viewport, no retry (see error-boundary.tsx: a
// boundary with nothing to reset offers a reload, not a retry that would likely re-throw immediately).

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("orbweaver: #root mount node missing from index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {/* The toast render half — the same `toastManager` bound to `notify` above (mounted OUTSIDE the
            AppErrorBoundary so a notification survives an app-level crash boundary swap). */}
        <ToastProvider toastManager={toastManager}>
          <AppErrorBoundary
            onError={reportClientError}
            renderFallback={(): ReactElement => (
              <Stack
                align="center"
                justify="center"
                className="min-h-dvh bg-background text-foreground"
              >
                <EmptyState
                  icon={<Icon icon={AlertTriangle} size="lg" />}
                  title="Something went wrong"
                  description="The app hit an unexpected error. Reloading usually fixes it."
                  action={
                    <Button intent="primary" onClick={(): void => globalThis.location.reload()}>
                      Reload
                    </Button>
                  }
                />
              </Stack>
            )}
          >
            <RouterProvider router={router} />
          </AppErrorBoundary>
          <Toaster />
        </ToastProvider>
        {DevTools === null ? null : (
          <Suspense fallback={null}>
            <DevTools queryClient={queryClient} router={router} />
          </Suspense>
        )}
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Agent/automation bridge (agent-bridge.ts): the `data-app-ready` wait signal (dev + prod) + the
// dev-only `globalThis.__orb` introspection handle. Installed AFTER render so the query cache exists
// and the readiness check observes the initial reads.
installAppReadySignal(queryClient);
installAgentDebugHandle(queryClient);
