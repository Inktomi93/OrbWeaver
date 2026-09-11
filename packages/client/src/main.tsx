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
import { createToastManager, ToastProvider } from "@orb/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
// biome mis-enumerates react's conditional-CJS export map and misses StrictMode specifically
// (useState/Component/etc. resolve fine); tsc resolves it and the client typechecks clean.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TRPCProvider } from "#data";
import { AppToaster, BootVeil } from "#features/app-shell";
import type { ContributorRegistry } from "#lib";
import { AppErrorBoundary, AppFailureSurface, bindNotify, bindSessionDocumentHost, buildClientErrorPayload, createToastNotify } from "#lib";
import type { ConfigSectionContribution } from "#state";
import { queryClient, trpcClient, trpcProxy } from "./compose/app-singletons.ts";
import { stampAppearanceBootHint } from "./compose/stamp-appearance-boot-hint.ts";
import { installAppReadySignal } from "./lib/app-ready-signal.ts";
import { routeResolution, router } from "./routes/router.tsx";
import "./styles/index.ts";

// EVERY dev-only instrument install, behind the literal import.meta.env.DEV the bundler constant-folds —
// so none of these modules (nor anything only they reach) lands in the production output at all. Both are
// dynamic imports rather than static ones for the same reason: a static import would put the graph back in
// the entry chunk in dev, and — for the agent handles — in prod too.
//
// THE AGENT HANDLES ARE HERE, NOT AT THE END OF THIS FILE (#433). `installAgentDebugHandle` always no-op'd
// outside dev, but its three implementations were BUILT at that call site — so `agent-nav`/`agent-seed`/
// `agent-rpg` were live STATIC imports of the boot chunk, dragging @orb/contracts `preset`/`rpg`/`refinery`
// and, through `contracts/preset` → `@orb/kit/macro` → `@orb/kit/cel`, the cel-js evaluator and luxon into
// the module script every visitor evaluates before the login form can paint. The assembly moved to the
// `agent-handles/` composition-tier sibling so this arm can be dynamic. It fires HERE, at the top, so
// `globalThis.__orb` and the motion observers land as early as the fetch allows — the singletons it needs
// are module-scope consts that already exist, and nothing about the handle wants to wait for the first
// render (only `installAppReadySignal` below does, and for its own reason).
/** Type-only — the erased shape `compose/config-sections.ts`'s `configSections` returns. Named here so
 *  the thunk below doesn't restate `ContributorRegistry<ConfigSectionContribution>` twice. */
type ConfigSectionRegistry = ContributorRegistry<ConfigSectionContribution>;

// Bind the session browser port before RouterProvider can start a route read or the QueryClient/socket can
// surface an auth failure. Data owns every target and recovery decision; this adapter supplies only DOM I/O.
bindSessionDocumentHost({
  currentPathname: (): string => globalThis.location.pathname,
  assign: (path): void => globalThis.location.assign(path),
  isVisible: (): boolean => globalThis.document.visibilityState === "visible",
  subscribeVisibility: (listener): (() => void) => {
    globalThis.document.addEventListener("visibilitychange", listener);
    return (): void => globalThis.document.removeEventListener("visibilitychange", listener);
  },
});

// #1638 — `openConfig`'s config-section registry, for `agent-handles/index.ts`'s `installAgentHandles`.
// `configSectionsForNav` is `null` until the dynamic import below resolves; `agent-nav/index.ts`'s
// `openConfig` reads it through this THUNK at CALL time (never at build time), so a `sub`/`setting`
// address asked for before this settles refuses loudly instead of validating vacuously. A STATIC import of
// `compose/config-sections.ts` here would be the exact #433 defect this whole dev-only block exists to
// dodge — it assembles literally every feature's config section, ~570 kB of graph — so this is a SECOND
// dynamic import, independent of the agent-handles one below (their relative resolve order doesn't matter;
// the thunk is read fresh on every `openConfig` call, not captured once).
let configSectionsForNav: ConfigSectionRegistry | null = null;
if (import.meta.env.DEV) {
  import("./lib/long-task-tracer.ts")
    .then(({ installLongTaskTracer }) => {
      installLongTaskTracer();
    })
    .catch((error: unknown) => globalThis.reportError(error));
  import("./compose/config-sections.ts")
    .then(({ configSections }) => {
      configSectionsForNav = configSections;
    })
    .catch((error: unknown) => globalThis.reportError(error));
  import("./agent-handles/index.ts")
    .then(({ installAgentHandles }) => {
      installAgentHandles(queryClient, trpcClient, trpcProxy, (): ConfigSectionRegistry | null => configSectionsForNav);
    })
    .catch((error: unknown) => globalThis.reportError(error));
}
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
  // @orb-waive caught-failure-ownership(trpcClient.clientError.mutate): a failed error report must never itself throw — there is nowhere left to report that to. Ends if reportClientError gets its own independent error surface.
  trpcClient.clientError.mutate(buildClientErrorPayload(error, ownerStack, url)).catch(() => {
    // A failed error report must never itself throw — there is nowhere left to report that to.
  });
}

// BEFORE THE FIRST RENDER, ON PURPOSE (#188 N-1, widened by #231). Reduced motion, font scale and the
// selected theme are SYNCED settings, so the shell can only stamp `<html>` once `settings.getUserSettings`
// (and, for the theme, the chained `settings.getTheme`) resolves — and the boot veil weaves, animates and
// drops frames a beat before that, while `--font-scale` resizes every rem-derived shell dimension when it
// finally lands (measured boot CLS 0.20–0.34 at scale 1.25, 209ms AFTER the veil's own exit stamp) and the
// theme swaps the whole palette dark→light on the first screen of every visit. This replays THIS DEVICE's
// remembered answers off localStorage synchronously — the strict CSP forbids an inline pre-hydration
// script, so this module IS the pre-paint window. The server value reconciles the moment it lands and
// always wins, and an axis this device has never been told stamps nothing (`#state` appearance-boot-hint).
stampAppearanceBootHint();

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
              <AppFailureSurface kind="crashed">
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
              </AppFailureSurface>
            )}
          >
            {/* The registry providers moved DOWN, into the `/` route's lazy chunk (compose/authed-app.tsx):
                only the authed tree consumes them, and hoisting them here would drag every feature into the
                boot bundle. */}
            <RouterProvider router={router} />
          </AppErrorBoundary>
          {/* The outlet stays HERE — outside AppErrorBoundary, above the router — so a notice survives the
              crash-boundary swap. WHERE it paints is `AppToaster`'s call: into the shell's notice band
              while a shell is mounted (a flow row that pushes content instead of covering it, #193), and
              the fixed overlay on a surface that has no band — the login screen, that same crash
              fallback. */}
          <AppToaster />
          {/* The boot loading veil — covers route resolution + the initial reads, dissolves itself on
              the `data-app-ready` stamp (installAppReadySignal below). Mounted beside the router so it
              OWNS its exit transition (a router pending component is ripped out with no exit phase). */}
          <BootVeil />
        </ToastProvider>
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Installed after render so the query cache exists and the readiness check observes the initial reads.
// The router rides along as the ROUTE-RESOLUTION port (#145): an idle query cache is only a settle once the
// route that owns the initial reads has actually mounted — on a cold stage `/`'s lazy chunk outlives the
// readiness grace, and without this the flag went up on the boot glyph.
installAppReadySignal(queryClient, routeResolution);
