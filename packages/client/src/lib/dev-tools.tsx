// The framework-devtools mount — ONE dev-only component holding the unified TanStack devtools
// shell with the Query + Router panels (Form devtools deliberately SKIPPED — 0.2.x, open
// prod-visibility bug; the T5 plan decision). DEV-ONLY BY CONSTRUCTION: main.tsx mounts this via
// `import.meta.env.DEV && lazy(import(...))` (literal DEV → the whole chunk constant-folds out of
// prod), PLUS @tanstack/devtools-vite's `removeDevtoolsOnBuild` belt in vite.config.ts. NEVER
// re-export this module from the lib barrel (or any barrel that also exports prod code) — the
// barrel-leak failure mode is exactly how dev-only code lands in prod bundles.
// The singletons arrive as PROPS from the composition root (main.tsx owns them; lib/ is the floor
// and imports nothing from data/ or routes/ — the `client-lib-floor` dep-cruiser rule), and the
// Query panel gets the EXPLICIT `client` prop (required inside the unified shell — plan decision).

import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import type { AnyRouter } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { ReactElement } from "react";

export interface DevToolsProps {
  readonly queryClient: QueryClient;
  readonly router: AnyRouter;
}

/** The unified TanStack devtools shell (floating trigger + panel dock), Query + Router panels. */
export function DevTools({ queryClient, router }: DevToolsProps): ReactElement {
  return (
    <TanStackDevtools
      plugins={[
        {
          id: "tanstack-query",
          name: "TanStack Query",
          render: <ReactQueryDevtoolsPanel client={queryClient} />,
        },
        {
          id: "tanstack-router",
          name: "TanStack Router",
          render: <TanStackRouterDevtoolsPanel router={router} />,
        },
      ]}
    />
  );
}
