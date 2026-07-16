import { Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";

// UPGRADE PATH (task #15 — the data layer): swap createRootRoute() for
// createRootRouteWithContext<{ queryClient; trpc; auth }>() and forward those singletons from the
// composition root at the RouterProvider seam — that context is the home for the beforeLoad auth gate on
// `/` + /login (UI-Lib-TanStack-Router.md steal-list #1/#2). Not wired now: none of those singletons
// exist yet, and the doctrine forbids constructing them here — the router context only ever FORWARDS.

function NotFound(): ReactElement {
  return (
    <Stack align="center" justify="center" gap="block" className="min-h-dvh bg-background text-foreground">
      <Heading level={1}>not found</Heading>
      <Text size="label" tone="muted">
        that route doesn’t exist.
      </Text>
    </Stack>
  );
}

export const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
});
