import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import type { ReactElement, ReactNode } from "react";
import type { SessionRecoveryState } from "#data";
import { QueryErrorState } from "#data";

/** The production durable-local readiness boundary, exported so CT can exercise the exact AppRoot branch. */
export function AppRootSessionBoundary({ recovery, children }: { readonly recovery: SessionRecoveryState; readonly children: ReactNode }): ReactElement {
  if (recovery.status === "error") {
    return <QueryErrorState label="your workspace" onRetry={recovery.retry} />;
  }
  if (recovery.status === "loading") {
    return <AriaAnnouncer message="Loading your workspace." />;
  }
  return <>{children}</>;
}
