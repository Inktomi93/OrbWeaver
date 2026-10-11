import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { AppFailureSurface } from "#lib";

/** A route whose load failed (a lazy chunk that would not fetch, a guard that threw): the failure with a retry,
 *  never the pending mark. `onRetry` owns re-running whatever failed. */
export function RouteError({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <AppFailureSurface kind="crashed">
      <EmptyState
        icon={<Icon icon={AlertTriangle} size="lg" />}
        title="Couldn't load this page"
        description="Part of the app failed to load. Retrying usually fixes it."
        action={
          <Button intent="primary" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    </AppFailureSurface>
  );
}
