// `<AppErrorBoundary>` — the app-level render-throw catch (PD-58; UI-Arch §2.1 lib/: cross-cutting
// display/util seam, the RenderProfiler precedent — "orbweaver has no _shared drawer, lib/ is the
// cross-cutting home"). Distinct from `data/query-boundary.tsx`'s `<QueryBoundary>` (a per-suspending-
// read boundary with a real "retry = refetch" story via `QueryErrorResetBoundary`): this one guards
// the WHOLE render tree against an uncaught throw with no query underneath it to reset, so its fallback
// offers no retry — a stale in-memory state that threw once will typically throw again immediately, and
// a full reload is the only recovery that's actually safe. A class component is the platform's only
// error-catch primitive (same precedent as `QueryErrorCatch` + `@orb/ui`'s `MarkdownErrorBoundary` — "no
// dep earns a seal for 30 lines").
//
// HOMING (UI-Primitives-and-Reuse.md §13.9): §13.9's parked list names "route-error-fallback" as
// adjudicated app-shell chrome — but that is the (unbuilt) TanStack Router `errorComponent` concept, a
// ROUTING-level fallback for a throw inside one route's loader/component. This is a different, broader
// concern (an app-level boundary catching a throw ANYWHERE in the tree, wired once at the composition
// root) whose whole job is the observability half — catch, attribute (`captureOwnerStack`), and REPORT.
// That makes it a client observability seam, not app-shell chrome, so it lives here in `lib/` beside
// `render-profiler.tsx` (an analogous generic React wrapper) rather than in `features/app-shell/`. It
// takes `onError`/`renderFallback` as props precisely so it stays decoupled from the tRPC client and any
// specific fallback UI — main.tsx (the composition root) supplies both.
//
// `captureOwnerStack()` (UI-Primitives-and-Reuse.md §13.1: "every error boundary attaches
// captureOwnerStack() in a DEV-only onError") is dev-build-only by React's own contract (returns `null`
// in prod) — the `IS_DEV` gate here is belt-and-braces so the call site itself never ships reasoning
// about a prod-only-null value.

import type { ErrorInfo, ReactNode } from "react";
// biome mis-enumerates react's conditional-CJS export map and misses Component/captureOwnerStack
// specifically (the same false positive main.tsx pins for StrictMode); tsc resolves it and the client
// typechecks.
// biome-ignore lint/correctness/noUnresolvedImports: tsc-verified false positive (see above).
import { Component, captureOwnerStack } from "react";
import { IS_DEV } from "./dev-flag";

export interface AppErrorBoundaryProps {
  /** Renders the crash fallback for the caught error. The caller decides how much detail to show (a DEV
   *  build may surface `error.message`; a prod build should not). */
  readonly renderFallback: (error: Error) => ReactNode;
  /** Fire-and-forget report hook — called once per catch with the error + the DEV-only owner stack (`null`
   *  in prod, or when unavailable). Never awaited here; a throwing/rejecting hook must not compound the
   *  crash it's reporting (guarded below). */
  readonly onError?: (error: Error, ownerStack: string | null) => void;
  readonly children: ReactNode;
}

interface CatchState {
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, CatchState> {
  override state: CatchState = { error: null };

  static getDerivedStateFromError(error: Error): CatchState {
    return { error };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    const ownerStack = IS_DEV ? captureOwnerStack() : null;
    try {
      this.props.onError?.(error, ownerStack);
    } catch {
      // The report path must never compound the crash it exists to report.
    }
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      return this.props.renderFallback(error);
    }
    return this.props.children;
  }
}
