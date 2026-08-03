// The suspense + error battery every surface wraps its suspending reads in. Bakes the
// QueryErrorResetBoundary -> error-boundary onReset handshake: without it "Try again" re-renders while
// the query is still in error state and throws again; reset() clears the query error first so the
// retry actually refetches. The PENDING arm is offline-aware: `networkMode: "online"` (query-client.ts,
// LAW) PAUSES queries offline — they never error, so without this line every suspended surface would
// spin its skeleton forever with zero feedback. The line renders ONLY while actually offline (never a
// flash on a normal load), and every surface inherits it here — zero per-feature edits.

import { Text } from "@orb/ui/text";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Component, Suspense } from "react";
import { QueryErrorState } from "./query-error-state.tsx";
import { useOnlineStatus } from "./use-online-status.ts";

export interface QueryBoundaryProps {
  /** The suspense fallback (a skeleton, never a spinner-only flash). */
  readonly fallback: ReactNode;
  /**
   * Renders the error surface; `retry` resets BOTH boundaries so the refetch is real.
   * @defaultValue a generic `QueryErrorState label="this"` — pass a labeled one for a specific surface.
   */
  readonly renderError?: (error: unknown, retry: () => void) => ReactNode;
  readonly children: ReactNode;
}

const defaultRenderError = (_error: unknown, retry: () => void): ReactNode => <QueryErrorState label="this" onRetry={retry} />;

interface CatchState {
  readonly error: unknown | null;
}

interface CatchProps {
  readonly onReset: () => void;
  readonly renderError: NonNullable<QueryBoundaryProps["renderError"]>;
  readonly children: ReactNode;
}

class QueryErrorCatch extends Component<CatchProps, CatchState> {
  override state: CatchState = { error: null };

  static getDerivedStateFromError(error: unknown): CatchState {
    return { error };
  }

  private readonly retry = (): void => {
    // Order matters: clear the QUERY error first (so the remount refetches instead of re-throwing
    // the cached error), then clear the boundary to remount the children.
    this.props.onReset();
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error !== null) {
      return this.props.renderError(this.state.error, this.retry);
    }
    return this.props.children;
  }
}

/** The pending fallback + the offline line: offline AND pending is the paused-forever state
 *  (`networkMode:"online"` never rejects a paused query), so it gets an explicit affordance. */
function PendingFallback({ children }: { readonly children: ReactNode }): ReactElement {
  const online = useOnlineStatus();
  return (
    <>
      {children}
      {online ? null : (
        <Text role="status" size="micro" tone="muted" className="text-center">
          Waiting for connection…
        </Text>
      )}
    </>
  );
}

export function QueryBoundary({ fallback, renderError = defaultRenderError, children }: QueryBoundaryProps): ReactElement {
  return (
    <QueryErrorResetBoundary>
      {({ reset }): ReactElement => (
        <QueryErrorCatch onReset={reset} renderError={renderError}>
          <Suspense fallback={<PendingFallback>{fallback}</PendingFallback>}>{children}</Suspense>
        </QueryErrorCatch>
      )}
    </QueryErrorResetBoundary>
  );
}
