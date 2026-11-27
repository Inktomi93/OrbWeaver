import { Heading, Text } from "@orb/ui/text";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AppFailureSurface } from "#lib";

function NotFound(): ReactElement {
  return (
    <AppFailureSurface kind="not-found">
      <Heading level={1}>not found</Heading>
      <Text ink="muted" voice="gloss" cap="prose" prose={true}>
        that route doesn’t exist.
      </Text>
    </AppFailureSurface>
  );
}

export const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
});
