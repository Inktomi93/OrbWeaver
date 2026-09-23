// The suspense + error battery every surface wraps its suspending reads in. Bakes the
// QueryErrorResetBoundary -> error-boundary onReset handshake: without it "Try again" re-renders while
// the query is still in error state and throws again; reset() clears the query error first so the
// retry actually refetches. The PENDING arm is offline-aware: `networkMode: "online"` (query-client.ts,
// LAW) PAUSES queries offline — they never error, so without this line every suspended surface would
// spin its skeleton forever with zero feedback. The line renders ONLY while actually offline (never a
// flash on a normal load), and every surface inherits it here — zero per-feature edits.
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

/** Wraps the SETTLED child and remembers the box it occupies for the next boot. Measured on every
 *  commit, not just mount (the rpg-band precedent): a child that grows in place refreshes its memory,
 *  and `surface-box-store`'s write epsilon swallows sub-pixel churn. It mounts only once the read has
 *  resolved (it is the Suspense child), so the first measurement is already settled geometry. */
function MeasuredSettle({ reserveKey, fill, children }: { readonly reserveKey: string; readonly fill: boolean; readonly children: ReactNode }): ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (el !== null) {
      rememberSurfaceBox(reserveKey, el.getBoundingClientRect().height);
    }
  });
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
          <Suspense fallback={<PendingFallback>{reservedFallback}</PendingFallback>}>{measuredChildren}</Suspense>
        </QueryErrorCatch>
      )}
    </QueryErrorResetBoundary>
  );
}
