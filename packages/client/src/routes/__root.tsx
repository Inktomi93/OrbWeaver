import { Stack } from "@orb/ui/layout";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";

// UPGRADE PATH (task #15 — the data layer): swap createRootRoute() for
// createRootRouteWithContext<{ queryClient; trpc; auth }>() and forward those singletons from the
// composition root at the RouterProvider seam — that context is the home for the beforeLoad auth gate on
// /login + /admin/* (UI-Lib-TanStack-Router.md steal-list #1/#2). Not wired now: none of those singletons
// exist yet, and the doctrine forbids constructing them here — the router context only ever FORWARDS.

function NotFound(): ReactElement {
  return (
    <Stack
      align="center"
      justify="center"
      gap="block"
      className="min-h-dvh bg-background text-foreground"
    >
      <h1 className="font-semibold text-foreground text-title">not found</h1>
      <p className="text-label text-muted-foreground">that route doesn’t exist.</p>
    </Stack>
  );
}

export const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
});
