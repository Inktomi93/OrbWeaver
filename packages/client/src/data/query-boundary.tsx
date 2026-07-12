// `<QueryBoundary>` (UI-Primitives §13.1): the suspense + error battery every surface wraps its
// suspending reads in. Bakes THE part everyone gets wrong (UI-Lib-TanStack-Query.md §8 — verified
// against the official suspense example): the `QueryErrorResetBoundary` → error-boundary `onReset`
// handshake — without it "Try again" re-renders, the query is STILL in error state, and it throws
// again; `reset()` clears the query error so the retry actually refetches. Children use
// `useSuspenseQuery`/`useSuspenseQueries` (non-null data, Compiler-clean; queries-PLURAL for
// parallel — suspense queries in one component run serially). Pane switches wrap in
// `startTransition` at the call site so the fallback doesn't flash (§4a pairs it with <Activity>).
// The error boundary is hand-built (the `@orb/ui` MarkdownErrorBoundary precedent) — a class
// component is the platform's only error-catch primitive; no dep earns a seal for 30 lines.

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver misreads react's export map for Suspense; tsc resolves it (StrictMode/Component resolve identically elsewhere).
import { Component, Suspense } from "react";
import { QueryErrorState } from "./query-error-state";

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

const defaultRenderError = (_error: unknown, retry: () => void): ReactNode => (
  <QueryErrorState label="this" onRetry={retry} />
);

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

export function QueryBoundary({
  fallback,
  renderError = defaultRenderError,
  children,
}: QueryBoundaryProps): ReactElement {
  return (
    <QueryErrorResetBoundary>
      {({ reset }): ReactElement => (
        <QueryErrorCatch onReset={reset} renderError={renderError}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </QueryErrorCatch>
      )}
    </QueryErrorResetBoundary>
  );
}
