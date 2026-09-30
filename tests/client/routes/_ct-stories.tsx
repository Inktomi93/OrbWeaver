// Route CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The `/` route
// (AppRoot) is the app's central navigation seam; it comes in via a relative path into the package
// (a route has no front-door subpath) and is wrapped in the real data layer (<CtDataProviders> — Query
// + real tRPC over the routeTrpc-stubbed network) plus the real section registry (<CtRealSectionRegistry>,
// mirroring main.tsx's door). AppRoot mounts the shell + active-chat + the four regions.

import { AppErrorBoundary } from "@orb/client/lib";
import { useActiveSection, useCorpusMode } from "@orb/client/state";
import { useQueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { StrictMode, useEffect } from "react";
// Deep, not `@orb/client/lib`: production readiness stays out of the barrel.
import type { RouteResolution } from "../../../packages/client/src/lib/app-ready-signal.ts";
import { installAppReadySignal } from "../../../packages/client/src/lib/app-ready-signal.ts";
import { AppRoot } from "../../../packages/client/src/routes/app-root.tsx";
import { router } from "../../../packages/client/src/routes/router.tsx";
import { CtDataProviders, CtRealSectionRegistry } from "../../support/browser/ct-data-providers.tsx";

/** The PRODUCTION router singleton (real route tree, guards, pending component and view transitions) under the
 *  same StrictMode + AppErrorBoundary pair main.tsx mounts it in, so a render crash inside a match lands on a
 *  visible fallback instead of an empty page. Browser history: the CT sets the address before it mounts. */
export function ProductionRouterStory(): ReactElement {
  return (
    <StrictMode>
      <CtDataProviders>
        <AppErrorBoundary renderFallback={(): ReactElement => <p data-testid="ct-app-crashed">Something went wrong</p>}>
          <RouterProvider router={router} />
        </AppErrorBoundary>
      </CtDataProviders>
    </StrictMode>
  );
}

// The route has already resolved when this story mounts, so only the query cache and the boot-read gate decide.
const RESOLVED_ROUTE: RouteResolution = { isResolving: () => false, subscribe: () => (): void => undefined };

function InstallAppReadySignal(): null {
  const client = useQueryClient();
  useEffect(() => {
    installAppReadySignal(client, RESOLVED_ROUTE);
  }, [client]);
  return null;
}

/** {@link HomePageStory} with the production readiness signal installed, as main.tsx installs it beside the router. */
export function HomePageReadinessStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <InstallAppReadySignal />
        <AppRoot />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The whole `/` route inside the real client data layer + the real section registry — the composed
 *  shell + active-chat seam (rail/list/content ride the registry; CONTEXT via app-root's M3 bridge). */
export function HomePageStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <AppRoot />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

export function ProductionRouterAliasStory(): ReactElement {
  const section = useActiveSection();
  const mode = useCorpusMode();
  return (
    <>
      <output aria-label="Workspace destination">{`${section}:${mode}`}</output>
      <ProductionRouterStory />
    </>
  );
}
