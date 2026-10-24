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
// so no sizing chain breaks) and, only if focus is still on `<body>`, focuses the first visible tab stop inside
// it, once, one commit after settling so a windowed list's rows exist; with none it lands on the recovery status. A
// retried read that fails again focuses the new Retry button the same way. A first load is never wrapped.
//
// THE RECOVERY STATUS. A boundary that has failed once keeps ONE screen-reader-only `role="status"` mounted
// beside its arm, empty until Retry writes into it, so the reloading and recovered messages are text changes
// a screen reader announces. It is out of flow, so the pending box is exactly a first load's.
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
// sentinel tier) shared with every consumer, home-born name and all. `data-reserve-key` names which
// surface a reserved box belongs to, for a test that holds several boundaries at once.

import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import type { ReactElement, ReactNode, Ref, RefObject } from "react";
import { Component, isValidElement, Suspense, useEffect, useId, useRef } from "react";
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

const RECOVERY_PHASES = ["idle", "reloading", "recovered"] as const;
type RecoveryPhase = (typeof RECOVERY_PHASES)[number];

const RECOVERY_MESSAGES: Readonly<Record<RecoveryPhase, string>> = { idle: "", reloading: "Reloading…", recovered: "Loaded again." };

interface CatchState {
  readonly error: unknown | null;
  /** True once the user pressed Retry on this mount; it never clears, because the settled wrapper must keep its place in the tree. */
  readonly retried: boolean;
  /** What the recovery status says: reloading from a Retry press, recovered once that read settles, idle otherwise. */
  readonly recovery: RecoveryPhase;
  /** True once a settled retry with no tab stop at commit has committed its recovered message; the focus hand-off waits for it. */
  readonly handoff: boolean;
}

/** What the catch hands its render prop: the retry and hand-off flags, the settle and pending signals, and the focus landing. */
interface RetryPhase {
  readonly retried: boolean;
  readonly handoff: boolean;
  readonly onSettled: (needsHandoff: boolean) => void;
  readonly onPending: () => void;
  readonly landing: RefObject<HTMLParagraphElement | null>;
}

interface CatchProps {
  readonly onReset: () => void;
  readonly renderError: NonNullable<QueryBoundaryProps["renderError"]>;
  readonly landing: RefObject<HTMLParagraphElement | null>;
  readonly children: (phase: RetryPhase) => ReactNode;
}

class QueryErrorCatch extends Component<CatchProps, CatchState> {
  override state: CatchState = { error: null, retried: false, recovery: "idle", handoff: false };

  static getDerivedStateFromError(error: unknown): Pick<CatchState, "error" | "recovery"> {
    return { error, recovery: "idle" };
  }

  private readonly retry = (): void => {
    // Order matters: clear the QUERY error first (so the remount refetches instead of re-throwing
    // the cached error), then clear the boundary to remount the children.
    this.props.onReset();
    this.setState({ error: null, retried: true, recovery: "reloading", handoff: false });
  };

  // One state update carries both, so the landing is focused only after it already says the settled message.
  private readonly onSettled = (needsHandoff: boolean): void => {
    this.setState({ recovery: "recovered", handoff: needsHandoff });
  };

  // A later suspend that is not a retry clears the recovered message, so the status never repeats a stale one.
  private readonly onPending = (): void => {
    if (this.state.recovery === "recovered") {
      this.setState({ recovery: "idle" });
    }
  };

  private renderArm(): ReactNode {
    if (this.state.error !== null) {
      const errorState = this.props.renderError(this.state.error, this.retry);
      // A read that fails again lands on a fresh Retry button; hand it the focus the pressed one lost.
      return this.state.retried ? <RetriedFocus>{errorState}</RetriedFocus> : errorState;
    }
    return this.props.children({
      retried: this.state.retried,
      handoff: this.state.handoff,
      onSettled: this.onSettled,
      onPending: this.onPending,
      landing: this.props.landing,
    });
  }

  override render(): ReactNode {
    // The status stays in the second slot across the error, pending and settled arms, so React keeps the one node.
    const failed = this.state.error !== null || this.state.retried;
    return (
      <>
        {this.renderArm()}
        {failed ? <RecoveryStatus phase={this.state.recovery} ref={this.props.landing} /> : null}
      </>
    );
  }
}

/** The recovery live region, which doubles as the focus landing of a retried read that settles with no tab stop.
 *  A `status` takes no name from its content, so it names itself to be read when focused. */
function RecoveryStatus({ phase, ref }: { readonly phase: RecoveryPhase; readonly ref: Ref<HTMLParagraphElement> }): ReactElement {
  const id = useId();
  return (
    <Text aria-labelledby={id} className="sr-only" data-slot="query-boundary-status" id={id} ref={ref} role="status" tabIndex={-1}>
      {RECOVERY_MESSAGES[phase]}
    </Text>
  );
}

/** The pending fallback + the offline line. Offline AND pending is the paused-forever state
 *  (`networkMode:"online"` never rejects a paused query), so it gets an explicit affordance. A retried read's
 *  pending message is the recovery status's, not a line here. `onPending` tells the catch a read is pending. */
function PendingFallback({ onPending, children }: { readonly onPending: () => void; readonly children: ReactNode }): ReactElement {
  const online = useOnlineStatus();
  useEffect(() => onPending(), [onPending]);
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

// Everything that can hold a tab stop; `isVisibleTabStop` rejects the ones that are not one right now.
const TAB_STOP_CANDIDATES = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [contenteditable="true"], [tabindex]';

// A control kept mounted but hidden (`tabindex="-1"`, under `aria-hidden` or `inert`, boxless) is no place for focus.
function isVisibleTabStop(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.matches(":disabled") || element.closest('[aria-hidden="true"], [inert]') !== null) {
    return false;
  }
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && element.checkVisibility({ visibilityProperty: true });
}

function firstVisibleTabStop(root: HTMLElement): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>(TAB_STOP_CANDIDATES)].find(isVisibleTabStop) ?? null;
}

/** The wrapper of a retried mount, around the settled children and around a repeat error state. It is
 *  layout-neutral (`display: contents`) because a wrapper box would cut every `h-full` child of a boundary off
 *  from its parent's height. Focus is handed off exactly once per retried settle, and only from `<body>`, where
 *  the pressed Retry left it. On commit (a Suspense child commits only when settled) the first visible tab stop
 *  takes it. With none, the catch commits the recovered message and then `handoff` re-checks one commit later,
 *  when a windowed list has mounted the rows it renders after its own commit, and falls back to the landing.
 *  Nothing claims focus after the hand-off, so a row that mounts later never takes it. */
function RetriedFocus({
  onSettled,
  handoff = false,
  landing,
  children,
}: {
  readonly onSettled?: (needsHandoff: boolean) => void;
  readonly handoff?: boolean;
  readonly landing?: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (root === null || document.activeElement !== document.body) {
      onSettled?.(false);
      return;
    }
    const stop = firstVisibleTabStop(root);
    if (stop !== null) {
      stop.focus({ preventScroll: true });
      onSettled?.(false);
      return;
    }
    onSettled?.(true);
  }, [onSettled]);
  useEffect(() => {
    if (!handoff) {
      return;
    }
    const root = rootRef.current;
    const pad = landing?.current ?? null;
    if (root === null || pad === null || document.activeElement !== document.body) {
      return;
    }
    (firstVisibleTabStop(root) ?? pad).focus({ preventScroll: true });
  }, [handoff, landing]);
  return (
    <Stack className="contents" data-slot="query-boundary-settled" ref={rootRef}>
      {children}
    </Stack>
  );
}

/** Only a retried mount pays for the focus wrapper; every first load renders its children unwrapped. */
function settledChildren(phase: RetryPhase, children: ReactNode): ReactNode {
  if (!phase.retried) {
    return children;
  }
  return (
    <RetriedFocus handoff={phase.handoff} landing={phase.landing} onSettled={phase.onSettled}>
      {children}
    </RetriedFocus>
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
      data-reserve-key={reserveKey}
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
  const landing = useRef<HTMLParagraphElement>(null);
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
        <QueryErrorCatch landing={landing} onReset={reset} renderError={renderError}>
          {(phase): ReactElement => (
            <Suspense fallback={<PendingFallback onPending={phase.onPending}>{reservedFallback}</PendingFallback>}>
              {settledChildren(phase, measuredChildren)}
            </Suspense>
          )}
        </QueryErrorCatch>
      )}
    </QueryErrorResetBoundary>
  );
}
