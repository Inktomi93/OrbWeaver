import { CtIsolation } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { RoutePending } from "#client/routes/route-pending.tsx";

/** The router's pending mark on its own, as `defaultPendingComponent` paints it. */
export function RoutePendingStory(): ReactElement {
  return (
    <CtIsolation subject="RoutePending" isolates="The router paints its pending mark before any provider mounts.">
      <RoutePending />
    </CtIsolation>
  );
}
