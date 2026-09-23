import { Heading, Text } from "@orb/ui/text";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AppFailureSurface } from "#lib";

// UPGRADE PATH (task #15 — the data layer): swap createRootRoute() for
// createRootRouteWithContext<{ queryClient; trpc; auth }>() and forward those singletons from the
// composition root at the RouterProvider seam — that context is the home for the beforeLoad auth gate on
// `/` + /login. Not wired now: none of those singletons
// exist yet, and the doctrine forbids constructing them here — the router context only ever FORWARDS.

function NotFound(): ReactElement {
  return (
    <AppFailureSurface kind="not-found">
      <Heading level={1}>not found</Heading>
      <Text size="label" tone="muted">
        that route doesn’t exist.
      </Text>
    </AppFailureSurface>
  );
}

export const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
});
