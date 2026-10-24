// The suspense + error battery every surface wraps its suspending reads in. Bakes the
// QueryErrorResetBoundary -> error-boundary onReset handshake: without it "Try again" re-renders while
// the query is still in error state and throws again; reset() clears the query error first so the
// retry actually refetches. The PENDING arm is offline-aware: `networkMode: "online"` (query-client.ts,
// LAW) PAUSES queries offline — they never error, so without this line every suspended surface would
// spin its skeleton forever with zero feedback. The line renders ONLY while actually offline (never a
// flash on a normal load), and every surface inherits it here — zero per-feature edits.
//
// FOCUS AFTER RETRY. The pressed Retry button unmounts with the error state, so once the read settles focus
// would sit on `<body>`. A retried mount wraps its settled children in a `display: contents` element (no box,
// so no sizing chain breaks) and focuses the first focusable control inside it on commit, only if focus is
// still on `<body>`; a retried read that fails again focuses the new Retry button the same way. The pending
// fallback shows the one status line while the retried read is in flight. A first load is never wrapped.
//
// THE RESERVATION SEAM (#885, lifted from home-tile.tsx's TileFallback/TileBody — this file is now the
// ONE home). A boundary that passes
// `reserveKey` opts into measure-then-remember: the fallback is wrapped in the box this device saw the
// child SETTLE at last time (`surface-box-store`, localStorage — synchronous, so the very first commit
// already carries it) and the settled child is measured back into the store on every commit. The tiles
// below a keyed surface then never move when its read lands (the F14 boot-CLS mechanism, for every
// surface instead of just home). A `SkeletonRows` fallback with a static `count` is additionally
// RE-FILLED to the reserved box (`skeletonRowCountFor`) so the reservation is honest about content as
// well as height; the authored count survives as the first-boot guess. DECLARED LIMIT: only the `line`
// shape is re-filled — `skeleton-row-metrics.ts` inverts exactly that arm's pitch (its own header rules
// `datum` out; `avatar-row`'s pitch is content-determined) — other shapes/fallbacks reserve unfilled.
// The `data-tile-reserved`/`data-tile-reserve-source` attributes are the pinned vocabulary (#837
// sentinel tier) shared with every consumer, home-born name and all.

import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Component, isValidElement, Suspense, useEffect, useRef } from "react";
import { rememberSurfaceBox, useSurfaceBox } from "#state";
import { QueryErrorState } from "../data/query-error-state.tsx";
import { skeletonRowCountFor } from "../data/skeleton-row-metrics.ts";
import type { SkeletonRowsProps } from "../data/skeleton-rows.tsx";
import { SkeletonRows } from "../data/skeleton-rows.tsx";
import { useOnlineStatus } from "../data/use-online-status.ts";

export interface QueryBoundaryProps {
  /** The suspense fallback (a skeleton, never a spinner-only flash). */
  readonly fallback: ReactNode;
  /**
   * The surface-box id (#885): opts this boundary into measure-then-remember reservation. The fallback
   * renders inside the height the child settled at on THIS device last time and the settled child is
   * re-measured on every commit, so a keyed surface holds its box across the read. Keys share the
   * `surface-box-store` namespace with the home tiles' registry ids; one mount, one key — a
   * deliberately shared surface routes through one exported const (gate `query-boundary-reservation`
   * REDs a repeated literal).
   */
  readonly reserveKey?: string;
  /**
   * A declared first-boot box in CSS px, for a surface whose settled height is a known constant
   * (`HomeTileContribution.skeletonBlock`, the rpg band's measured-range estimate). Used only until
   * this device's own measurement exists, and only with `reserveKey`.
   */
  readonly reserveBlock?: number | undefined;
  /** Preserve a parent-owned definite height through the reservation wrapper. */
  readonly fill?: boolean;
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
  /** True once the user pressed Retry on this mount; it never clears, because the settled wrapper must keep its place in the tree. */
  readonly retried: boolean;
  /** True from a Retry press until that read settles or fails again; drives the pending status line only. */
  readonly retrying: boolean;
}

/** What the catch hands its render prop: the retry phase flags and the settle signal. */
interface RetryPhase {
  readonly retried: boolean;
  readonly retrying: boolean;
  readonly onSettled: () => void;
}

interface CatchProps {
  readonly onReset: () => void;
  readonly renderError: NonNullable<QueryBoundaryProps["renderError"]>;
  readonly children: (phase: RetryPhase) => ReactNode;
}

class QueryErrorCatch extends Component<CatchProps, CatchState> {
  override state: CatchState = { error: null, retried: false, retrying: false };

  static getDerivedStateFromError(error: unknown): Pick<CatchState, "error" | "retrying"> {
    return { error, retrying: false };
  }

  private readonly retry = (): void => {
    // Order matters: clear the QUERY error first (so the remount refetches instead of re-throwing
    // the cached error), then clear the boundary to remount the children.
    this.props.onReset();
    this.setState({ error: null, retried: true, retrying: true });
  };

  private readonly onSettled = (): void => {
    this.setState({ retrying: false });
  };

  override render(): ReactNode {
    if (this.state.error !== null) {
      const errorState = this.props.renderError(this.state.error, this.retry);
      // A read that fails again lands on a fresh Retry button; hand it the focus the pressed one lost.
      return this.state.retried ? <RetriedFocus>{errorState}</RetriedFocus> : errorState;
    }
    return this.props.children({ retried: this.state.retried, retrying: this.state.retrying, onSettled: this.onSettled });
  }
}

/** The pending fallback + its one status line. Offline AND pending is the paused-forever state
 *  (`networkMode:"online"` never rejects a paused query), so it gets an explicit affordance; a pending
 *  read the user just retried says so, because the Retry button that had focus is already gone. */
function PendingFallback({ retrying, children }: { readonly retrying: boolean; readonly children: ReactNode }): ReactElement {
  const online = useOnlineStatus();
  return (
    <>
      {children}
      {online && !retrying ? null : (
        <Text role="status" size="micro" tone="muted" className="text-center">
          {online ? "Reloading…" : "Waiting for connection…"}
        </Text>
      )}
    </>
  );
}

// Natively focusable controls only: a disabled control is skipped, and `tabindex="-1"` is not a tab stop.
const FIRST_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The wrapper of a retried mount, around the settled children and around a repeat error state. It is
 *  layout-neutral (`display: contents`) because a wrapper box would cut every `h-full` child of a boundary off
 *  from its parent's height. The pressed Retry button unmounts with the error state, so focus would fall to `<body>`;
 *  once the arm commits (a Suspense child commits only when settled) the first focusable control inside takes
 *  it, unless the user already moved focus somewhere real while the read was pending. An arm with no
 *  focusable control keeps focus on `<body>`. `onSettled` tells the catch the retried read has landed. */
function RetriedFocus({ onSettled, children }: { readonly onSettled?: () => void; readonly children: ReactNode }): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (document.activeElement === document.body) {
      rootRef.current?.querySelector<HTMLElement>(FIRST_FOCUSABLE)?.focus({ preventScroll: true });
    }
    onSettled?.();
  }, [onSettled]);
  return (
    <Stack className="contents" data-slot="query-boundary-settled" ref={rootRef}>
      {children}
    </Stack>
  );
}

/** Only a retried mount pays for the focus wrapper; every first load renders its children unwrapped. */
function settledChildren(retried: boolean, onSettled: () => void, children: ReactNode): ReactNode {
  if (!retried) {
    return children;
  }
  return <RetriedFocus onSettled={onSettled}>{children}</RetriedFocus>;
}

/** A `SkeletonRows` fallback with a static count, re-filled to the reserved box; anything else
 *  passes through untouched (the box still reserves — see the header's declared limit). Re-rendered as a
 *  fresh element rather than `cloneElement` (`no-legacy-react-api`): the type check has already narrowed
 *  the props, so a plain spread carries everything and overrides only the count. */
function fillToBox(fallback: ReactNode, box: number): ReactNode {
  if (!isValidElement(fallback) || fallback.type !== SkeletonRows) {
    return fallback;
  }
  const props = fallback.props as SkeletonRowsProps;
  if (typeof props.count !== "number" || (props.shape !== undefined && props.shape !== "line")) {
    return fallback;
  }
  return <SkeletonRows {...props} count={skeletonRowCountFor(box, props.count)} />;
}

/** The keyed loading box. THREE SOURCES, ONE MECHANISM (#177): the measured box wins (what THIS device
 *  saw last settle); then the declared px constant; then nothing — the fallback renders unreserved and
 *  its own row count is the first-boot claim. EXACT (`blockSize`), not a floor: a remembered box
 *  SHORTER than the skeleton's natural height would otherwise still shrink when the read lands. The
 *  skeleton is decorative, so overflowing rows clip rather than push the box (a runtime measurement,
 *  not a design value — no token exists for "the height this surface happened to occupy"). */
function ReservedFallback({
  reserveKey,
  reserveBlock,
  fill,
  children,
}: {
  readonly reserveKey: string;
  readonly reserveBlock: number | undefined;
  readonly fill: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const measured = useSurfaceBox(reserveKey);
  const box = measured ?? reserveBlock ?? null;
  if (box === null) {
    return <Stack className={fill ? "h-full min-h-0 flex-1" : undefined}>{children}</Stack>;
  }
  return (
    <Stack
      data-tile-reserved={Math.round(box)}
      // WHICH source held the box open: "this device MEASURED it" is a different claim from "the mount
      // declared a constant" — a first-boot assertion reading only `data-tile-reserved` would silently
      // start passing for the wrong reason.
      data-tile-reserve-source={measured === null ? "declared" : "measured"}
      style={{ blockSize: `${Math.round(box)}px`, overflow: "clip" }}
    >
      {fillToBox(children, box)}
    </Stack>
  );
}

/** Wraps the SETTLED child and remembers the box it occupies for the next boot. A `ResizeObserver` records the
 *  body's laid-out height, not a passive-effect read: a child that renders twice to settle (a first pass, then a
 *  layout-effect trim) would otherwise be measured on its first pass. It also refreshes the memory when a child
 *  grows in place, and `surface-box-store`'s write epsilon swallows sub-pixel churn. */
function MeasuredSettle({ reserveKey, fill, children }: { readonly reserveKey: string; readonly fill: boolean; readonly children: ReactNode }): ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (el === null) {
      return;
    }
    const observer = new ResizeObserver(() => rememberSurfaceBox(reserveKey, el.getBoundingClientRect().height));
    observer.observe(el);
    return (): void => observer.disconnect();
  }, [reserveKey]);
  return (
    <Stack className={fill ? "h-full min-h-0 flex-1" : undefined} ref={bodyRef}>
      {children}
    </Stack>
  );
}

export function QueryBoundary({
  fallback,
  reserveKey,
  reserveBlock,
  fill = false,
  renderError = defaultRenderError,
  children,
}: QueryBoundaryProps): ReactElement {
  const reservedFallback =
    reserveKey === undefined ? (
      fallback
    ) : (
      <ReservedFallback fill={fill} reserveBlock={reserveBlock} reserveKey={reserveKey}>
        {fallback}
      </ReservedFallback>
    );
  const measuredChildren =
    reserveKey === undefined ? (
      children
    ) : (
      <MeasuredSettle fill={fill} reserveKey={reserveKey}>
        {children}
      </MeasuredSettle>
    );
  return (
    <QueryErrorResetBoundary>
      {({ reset }): ReactElement => (
        <QueryErrorCatch onReset={reset} renderError={renderError}>
          {({ retried, retrying, onSettled }): ReactElement => (
            <Suspense fallback={<PendingFallback retrying={retrying}>{reservedFallback}</PendingFallback>}>
              {settledChildren(retried, onSettled, measuredChildren)}
            </Suspense>
          )}
        </QueryErrorCatch>
      )}
    </QueryErrorResetBoundary>
  );
}
