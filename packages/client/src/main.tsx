// The client composition root — the BOOT half of the registration door: binds the app-wide singletons
// (constructed once in `./compose/app-singletons.ts`) into the provider stack, mounts the router, and
// raises the boot veil. Nothing imports this file; everything consumes via providers/hooks.
//
// THE REGISTRY ASSEMBLIES LIVE IN `./compose/authed-app.tsx` (#43, the boot code-split) — still exactly ONE
// assembly per registry, still inside the door (`registry-assembly-at-door-only` names `compose/` as the
// door's own helper tier, client-architecture-lockdown.md §7), but behind the `/` route's lazy boundary so
// the ~4.9 MB feature graph is a chunk an unauthenticated client never fetches or parses. This file must
// stay import-thin: everything it pulls is in the boot chunk that every visitor downloads before the login
// form can paint. Add a section/modal/pane/contributor in `compose/authed-app.tsx`, never here.

// FIRST import, before ANYTHING that constructs a Zod schema: opts Zod into jitless so its
// `new Function` eval-probe never fires under our strict CSP. Zod memoizes that probe at the
// first object-schema construction — which happens during THIS module's imports, not its body —
// so configuring it below would be too late. See ./lib/zod-jitless.ts for the full diagnosis.
import "./lib/zod-jitless.ts";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc +
// vite resolve AlertTriangle/Icon fine (the same gap `#primitives/icons` hits inside packages/ui itself
// — see status-chip.tsx).
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { createToastManager, Toaster, ToastProvider } from "@orb/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
// biome mis-enumerates react's conditional-CJS export map and misses StrictMode/lazy/Suspense
// specifically (useState/Component/etc. resolve fine); tsc resolves them and the client
// typechecks clean.
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { TRPCProvider } from "#data";
import { BootVeil } from "#features/app-shell";
import { AppErrorBoundary, bindNotify, buildClientErrorPayload, createToastNotify } from "#lib";
import { buildAgentNav } from "./agent-nav/index.ts";
import { buildAgentSeed } from "./agent-seed/index.ts";
import { queryClient, trpcClient, trpcProxy } from "./compose/app-singletons.ts";
import { installAgentDebugHandle, installAppReadySignal } from "./lib/agent-bridge.ts";
import { isProbeMode } from "./lib/probe-mode.ts";
import { router } from "./routes/router.tsx";
import "./styles/globals.css";

// Both arms behind the literal import.meta.env.DEV, which the bundler constant-folds so neither
// module lands in the prod output. Dynamic import keeps the tracer out of the entry chunk in dev too.
if (import.meta.env.DEV) {
  void import("./lib/long-task-tracer.ts").then(({ installLongTaskTracer }) => {
    installLongTaskTracer();
  });
}
// Deep import on purpose — dev-tools must never ride a barrel that also exports prod code.
const DevTools = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import("./lib/dev-tools.tsx");
      return { default: mod.DevTools };
    })
  : null;

// A redeploy rotates hashed chunk names; an old tab that lazy-imports a chunk with a stale hash
// white-screens. Soft-reload once — the sessionStorage guard stops a reload loop.
const PRELOAD_RELOAD_FLAG = "orb:preload-reloaded";
globalThis.addEventListener("vite:preloadError", () => {
  if (globalThis.sessionStorage.getItem(PRELOAD_RELOAD_FLAG) !== null) {
    return;
  }
  globalThis.sessionStorage.setItem(PRELOAD_RELOAD_FLAG, "1");
  globalThis.location.reload();
});

// The app-wide toast manager, minted outside React so it binds once here and <ToastProvider> renders
// whatever notify.* enqueues. Without this bind, user-facing errors were console-only.
const toastManager = createToastManager();
bindNotify(createToastNotify(toastManager));

function reportClientError(error: Error, ownerStack: string | null): void {
  const url = `${globalThis.location.pathname}${globalThis.location.search}`;
  trpcClient.clientError.mutate(buildClientErrorPayload(error, ownerStack, url)).catch(() => {
    // A failed error report must never itself throw — there is nowhere left to report that to.
  });
}

const rootEl = document.getElementById("root");
if (rootEl === null) {
  throw new Error("orbweaver: #root mount node missing from index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {/* Mounted outside AppErrorBoundary so a notification survives an app-level crash boundary swap. */}
        <ToastProvider toastManager={toastManager}>
          <AppErrorBoundary
            onError={reportClientError}
            renderFallback={(): ReactElement => (
              <Stack align="center" justify="center" className="min-h-dvh bg-background text-foreground">
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
            {/* The registry providers moved DOWN, into the `/` route's lazy chunk (compose/authed-app.tsx):
                only the authed tree consumes them, and hoisting them here would drag every feature into the
                boot bundle. */}
            <RouterProvider router={router} />
          </AppErrorBoundary>
          <Toaster />
          {/* The boot loading veil — covers route resolution + the initial reads, dissolves itself on
              the `data-app-ready` stamp (installAppReadySignal below). Mounted beside the router so it
              OWNS its exit transition (a router pending component is ripped out with no exit phase). */}
          <BootVeil />
        </ToastProvider>
        {DevTools === null || isProbeMode() ? null : (
          <Suspense fallback={null}>
            <DevTools queryClient={queryClient} router={router} />
          </Suspense>
        )}
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Installed after render so the query cache exists and the readiness check observes the initial reads.
installAppReadySignal(queryClient);
installAgentDebugHandle(queryClient, buildAgentNav(trpcProxy, queryClient), buildAgentSeed(trpcClient));
