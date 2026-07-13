// The framework-devtools mount — one dev-only component holding the unified TanStack devtools shell
// with the Query + Router panels (Form devtools deliberately skipped — open prod-visibility bug).
// Dev-only by construction: main.tsx mounts this via `import.meta.env.DEV && lazy(import(...))`. NEVER
// re-export this module from the lib barrel — that's exactly how dev-only code lands in prod bundles.

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
