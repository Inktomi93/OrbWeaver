import type { ReactElement } from "react";
import { RoutePending } from "#client/routes/route-pending.tsx";

/** The router's pending mark on its own, as `defaultPendingComponent` paints it. */
export function RoutePendingStory(): ReactElement {
  return <RoutePending />;
}
