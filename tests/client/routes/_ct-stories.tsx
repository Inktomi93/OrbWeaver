import { ListPaneHeaderHost, QueryBoundary } from "@orb/client/components";
import { insightsCorpusMode } from "@orb/client/features/stats";
import { labelsCorpusMode } from "@orb/client/features/tag";
import type { CorpusMode, ListSearchPolicy } from "@orb/client/lib";
import { CORPUS_MODES } from "@orb/client/lib";
import { setActiveSection, setCorpusMode, useSectionRegistry } from "@orb/client/state";
// Route CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The `/` route
// (AppRoot) is the app's central navigation seam; it comes in via a relative path into the package
// (a route has no front-door subpath) and is wrapped in the real data layer (<CtDataProviders> — Query
// + real tRPC over the routeTrpc-stubbed network) plus the real section registry (<CtRealSectionRegistry>,
// mirroring main.tsx's door). AppRoot mounts the shell + active-chat + the four regions.

import { consumeInboundJoinToken, peekInboundJoinToken } from "@orb/client/data";
import { AppErrorBoundary, useRouterUrlReplace } from "@orb/client/lib";
import { useActiveSection, useCorpusMode } from "@orb/client/state";
import { useQueryClient } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { StrictMode, use, useEffect, useState } from "react";
import { RegionAnchor } from "#client/features/app-shell/anchors/region-anchor.tsx";
// Deep, not `@orb/client/lib`: production readiness stays out of the barrel.
import type { RouteResolution } from "#client/lib/app-ready-signal.ts";
import { installAppReadySignal } from "#client/lib/app-ready-signal.ts";
import { AppRoot } from "#client/routes/app-root.tsx";
import { RoutePending } from "#client/routes/route-pending.tsx";
import { bindRouteCrashReporter, router } from "#client/routes/router.tsx";
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

/** {@link ProductionRouterStory} with the route crash reporter bound, as main.tsx binds it. Reports land on
 *  `globalThis.__ctRouteCrashes` for the test to read. */
export function ProductionRouterCrashReportStory(): ReactElement {
  const [bound] = useState(() => {
    const crashes: string[] = [];
    Object.assign(globalThis, { __ctRouteCrashes: crashes });
    bindRouteCrashReporter((error) => crashes.push(error.message));
    return true;
  });
  return bound ? <ProductionRouterStory /> : <p />;
}

export function ProductionRouterOverlapStory(): ReactElement {
  return (
    <>
      <button type="button" onClick={(): void => void router.navigate({ href: "/login?first=1" })}>
        First navigation
      </button>
      <button type="button" onClick={(): void => void router.navigate({ href: "/login?second=1" })}>
        Second navigation
      </button>
      <ProductionRouterStory />
    </>
  );
}

function TokenHandoffProbe(): ReactElement {
  const [token] = useState(peekInboundJoinToken);
  const [remaining, setRemaining] = useState("unread");
  const replaceUrl = useRouterUrlReplace();
  useEffect(() => {
    consumeInboundJoinToken(replaceUrl);
  }, [replaceUrl]);
  return (
    <>
      <output aria-label="Captured invite">{token}</output>
      <button type="button" onClick={(): void => setRemaining(peekInboundJoinToken() ?? "spent")}>
        Read remaining token
      </button>
      <output aria-label="Remaining invite">{remaining}</output>
    </>
  );
}

/** The real token consumer and URL replacement hook inside a browser router. */
export function RouterTokenHandoffStory(): ReactElement {
  const [handoffRouter] = useState(() => {
    const root = createRootRoute();
    const home = createRoute({ getParentRoute: () => root, path: "/", component: TokenHandoffProbe });
    return createRouter({ routeTree: root.addChildren([home]) });
  });
  return <RouterProvider router={handoffRouter} />;
}

function HomePageRouter(): ReactElement {
  const [homeRouter] = useState(() => {
    const root = createRootRoute();
    const home = createRoute({ getParentRoute: () => root, path: "/", component: AppRoot });
    return createRouter({ routeTree: root.addChildren([home]) });
  });
  return <RouterProvider router={homeRouter} />;
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
        <HomePageRouter />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** {@link HomePageStory} under the production router pending screen: a read that suspends past every section
 *  boundary replaces the whole shell with the loading glyph here, exactly as it does in the app. */
export function HomePagePendingStory(): ReactElement {
  const [pendingRouter] = useState(() => {
    const root = createRootRoute();
    const home = createRoute({ getParentRoute: () => root, path: "/", component: AppRoot });
    return createRouter({ routeTree: root.addChildren([home]), defaultPendingComponent: RoutePending, defaultPendingMs: 0 });
  });
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <RouterProvider router={pendingRouter} />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function SuspendsUntilReleased({ released }: { readonly released: Promise<void> }): ReactElement {
  use(released);
  return <p>list settled</p>;
}

/** A shell region whose body suspends with no boundary of its own, under the router pending screen. The release
 *  button and the marker sit OUTSIDE the region: they stay on screen only if the region itself holds the suspension. */
export function RegionSuspenseStory(): ReactElement {
  const [gate] = useState(() => Promise.withResolvers<void>());
  const [pendingRouter] = useState(() => {
    const root = createRootRoute();
    const home = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: (): ReactElement => (
        <>
          <p>shell outside the region</p>
          <button type="button" onClick={(): void => gate.resolve()}>
            Release list
          </button>
          <RegionAnchor region="list">
            <SuspendsUntilReleased released={gate.promise} />
          </RegionAnchor>
        </>
      ),
    });
    return createRouter({ routeTree: root.addChildren([home]), defaultPendingComponent: RoutePending, defaultPendingMs: 0 });
  });
  return (
    <CtDataProviders>
      <RouterProvider router={pendingRouter} />
    </CtDataProviders>
  );
}

/** The whole `/` route inside the real client data layer + the real section registry — the composed
 *  shell + active-chat seam (rail/list/content ride the registry; CONTEXT via app-root's M3 bridge). */
export function HomePageStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <HomePageRouter />
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

/** The census derives its subjects from the production registry, including each Corpus mode. */
export function SectionRosterCensusStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <SectionRosterCensus />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function SectionRosterCensus(): ReactElement {
  const registry = useSectionRegistry();
  const sectionId = useActiveSection();
  const mode = useCorpusMode();
  const definition = registry.get(sectionId);
  const corpusSearch: Readonly<Record<CorpusMode, ListSearchPolicy>> = {
    explore: registry.get("corpus").listSearch ?? "required",
    insights: insightsCorpusMode.listSearch,
    labels: labelsCorpusMode.listSearch,
  };
  const searchPolicy = sectionId === "corpus" ? corpusSearch[mode] : definition.listSearch;
  return (
    <div>
      <nav aria-label="Roster census">
        {registry
          .list()
          .filter((section) => section.list !== undefined)
          .flatMap((section) =>
            section.id === "corpus"
              ? CORPUS_MODES.map((variant) => (
                  <button
                    key={`${section.id}:${variant}`}
                    type="button"
                    onClick={(): void => {
                      setActiveSection(section.id);
                      setCorpusMode(variant);
                    }}
                  >
                    Census {section.id}:{variant}
                  </button>
                ))
              : [
                  <button key={section.id} type="button" onClick={(): void => setActiveSection(section.id)}>
                    Census {section.id}
                  </button>,
                ],
          )}
      </nav>
      {definition.list === undefined ? null : (
        <section
          aria-label="Census list"
          data-search-policy={typeof searchPolicy === "string" ? searchPolicy : "planned"}
          data-search-reason={typeof searchPolicy === "object" ? searchPolicy.planned : ""}
          style={{ width: 400, height: 700, display: "flex", flexDirection: "column" }}
        >
          <div data-slot="census-band">
            <ListPaneHeaderHost key={sectionId} useView={definition.useListHeader} />
          </div>
          <div style={{ minHeight: 0, flex: 1 }}>
            <QueryBoundary fallback={<p>Loading roster</p>}>{definition.list()}</QueryBoundary>
          </div>
        </section>
      )}
    </div>
  );
}
