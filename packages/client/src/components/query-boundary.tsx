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
// A declared `reserveRows` count builds its length from tokens and refills the skeleton to the same count, and a measured box refills to the count remembered
// beside it, so neither reads the document in render. A declared CSS length is held but never refilled (the count needs a pixel box), and
// `data-tile-reserved` then carries the length itself. A declared pixel constant still inverts its pitch from the document.
// The `data-tile-reserved`/`data-tile-reserve-source` attributes are the pinned vocabulary (#837
// sentinel tier) shared with every consumer, home-born name and all. `data-reserve-key` names which
// surface a reserved box belongs to, for a test that holds several boundaries at once.

import { Contents, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import type { ReactElement, ReactNode, Ref, RefObject } from "react";
import { Component, isValidElement, Suspense, useEffect, useId, useRef } from "react";
import { holdArrivalWhilePending } from "#lib";
import { rememberSurfaceBox, useSurfaceBox, useSurfaceRows } from "#state";
import { QueryErrorState } from "../data/query-error-state.tsx";
import { QUERY_WAITING_LINE } from "../data/query-state-copy.ts";
import { skeletonLengthFor, skeletonRowCountFor } from "../data/skeleton-row-metrics.ts";
import type { SkeletonRowsProps } from "../data/skeleton-rows.tsx";
import { SkeletonRows } from "../data/skeleton-rows.tsx";
import { QueryBoundaryScope } from "../data/suspense-reads.ts";
import { useOnlineStatus } from "../data/use-online-status.ts";

/**
 * A declared first-boot box, used only until this device's own measurement exists, and only with `reserveKey`. A boundary declares it one way or the other:
 * `reserveBlock` for a surface whose settled height is a known constant (`HomeTileContribution.skeletonBlock`, the rpg band's estimate), as CSS px or a
 * CSS length built from tokens, which the browser resolves and no render reads; or `reserveRows` for a surface that knows how many `SkeletonRows`
 * `shape="line"` rows it settles at, from which the boundary builds the length from tokens and refills the skeleton to the count.
 */
type DeclaredReserve =
  | { readonly reserveBlock?: number | string | undefined; readonly reserveRows?: never }
  | { readonly reserveRows?: number | undefined; readonly reserveBlock?: never };

interface QueryBoundaryBase {
  /** The suspense fallback (a skeleton, never a spinner-only flash). */
  readonly fallback: ReactNode;
  /**
   * The surface-box id (#885): opts this boundary into measure-then-remember reservation. The fallback
   * renders inside the height the child settled at on THIS device last time and the settled child is
   * re-measured on every commit, so a keyed surface holds its box across the read. Keys share the
   * `surface-box-store` namespace with the home tiles' registry ids; one mount, one key — a
   * deliberately shared surface routes through one exported const, never a
   * repeated literal.
   */
  readonly reserveKey?: string;
  /** Preserve a parent-owned definite height through the reservation wrapper. */
  readonly fill?: boolean;
  /** The wrappers share the room a flex parent leaves and give way below their content, so a bounded dialog holds the skeleton and the settled child in one box. */
  readonly grow?: boolean;
  /**
   * Renders the error surface; `retry` resets BOTH boundaries so the refetch is real.
   * @defaultValue a generic `QueryErrorState label="this"` — pass a labeled one for a specific surface.
   */
  readonly renderError?: (error: unknown, retry: () => void) => ReactNode;
  /**
   * The inputs the child's reads are keyed on — every prop or value that changes which query the subtree reads; `[]` for a
   * subtree whose reads take none. A change clears a caught error and resets the query errors, so the new key reads
   * instead of the old key's error standing until Retry, and a revisited key refetches instead of re-throwing its cached error.
   */
  readonly resetKeys: readonly unknown[];
  readonly children: ReactNode;
}

export type QueryBoundaryProps = QueryBoundaryBase & DeclaredReserve;

const defaultRenderError = (_error: unknown, retry: () => void): ReactNode => <QueryErrorState label="this" onRetry={retry} />;

const RECOVERY_PHASES = ["idle", "reloading", "recovered"] as const;
type RecoveryPhase = (typeof RECOVERY_PHASES)[number];

const RECOVERY_MESSAGES: Readonly<Record<RecoveryPhase, string>> = { idle: "", reloading: "Reloading…", recovered: "Loaded again." };

interface CatchState {
  readonly error: unknown;
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
  readonly resetKeys: readonly unknown[];
  readonly children: (phase: RetryPhase) => ReactNode;
}

function keysChanged(previous: readonly unknown[], next: readonly unknown[]): boolean {
  return previous.length !== next.length || previous.some((key, at) => !Object.is(key, next[at]));
}

class QueryErrorCatch extends Component<CatchProps, CatchState> {
  override state: CatchState = { error: null, retried: false, recovery: "idle", handoff: false };

  static getDerivedStateFromError(error: unknown): Pick<CatchState, "error" | "recovery"> {
    return { error, recovery: "idle" };
  }

  // The keys of the last commit with no error standing, and the keys the standing error was caught under.
  private settledKeys: readonly unknown[] = this.props.resetKeys;
  private caughtKeys: readonly unknown[] = this.props.resetKeys;
  // Every error this boundary has caught. A query keeps its error object in the cache, so a revisited key re-throws one of these.
  private readonly seenErrors = new WeakSet<object>();

  // A new key is a new read, not a retry. Two catches reset: a key change under a standing error, and a revisited key
  // re-throwing an error this boundary already caught, with no request. A fresh key that fails throws a new error, even when
  // its render was deferred and its keys never committed, so it stands. Each reset records the keys first, so a key change
  // gets at most one: a child that throws again under the same keys stands as the error arm.
  override componentDidUpdate(_previous: CatchProps, previousState: CatchState): void {
    const { error } = this.state;
    if (error === null) {
      this.settledKeys = this.props.resetKeys;
      return;
    }
    if (previousState.error === null) {
      const revisit = typeof error === "object" && this.seenErrors.has(error) && keysChanged(this.settledKeys, this.props.resetKeys);
      if (typeof error === "object") {
        this.seenErrors.add(error);
      }
      if (!revisit) {
        this.caughtKeys = this.props.resetKeys;
        return;
      }
    } else if (!keysChanged(this.caughtKeys, this.props.resetKeys)) {
      return;
    }
    this.caughtKeys = this.props.resetKeys;
    this.settledKeys = this.props.resetKeys;
    this.props.onReset();
    // eslint-disable-next-line react-x/no-set-state-in-component-did-update -- the error arm committed under the new keys; clearing it in the same commit means it never paints.
    this.setState({ error: null, recovery: "idle" });
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
  // A press that opened this read's surface keeps its arrival focus until the read settles (`useFocusOnMount`).
  useEffect(() => holdArrivalWhilePending(), []);
  return (
    <>
      {children}
      {online ? null : (
        <Text role="status" ink="muted" textAlign="center" voice="gloss">
          {QUERY_WAITING_LINE}
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
    <Contents data-slot="query-boundary-settled" ref={rootRef}>
      {children}
    </Contents>
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

/** A `SkeletonRows` fallback with a static count, re-filled to the reserved box's row count; anything else
 *  passes through untouched (the box still reserves — see the header's declared limit). Re-rendered as a
 *  fresh element rather than `cloneElement` (`no-legacy-react-api`): the type check has already narrowed
 *  the props, so a plain spread carries everything and overrides only the count. */
function fillRows(fallback: ReactNode, rowsFor: (authored: number) => number): ReactNode {
  if (!isValidElement<SkeletonRowsProps>(fallback) || fallback.type !== SkeletonRows) {
    return fallback;
  }
  const { props } = fallback;
  if (typeof props.count !== "number" || (props.shape !== undefined && props.shape !== "line")) {
    return fallback;
  }
  return <SkeletonRows {...props} count={rowsFor(props.count)} />;
}

/** The skeleton refilled to a remembered count; a box remembered without one leaves it as authored. */
function fillRowsTo(skeleton: ReactNode, rows: number | null): ReactNode {
  return rows === null ? skeleton : fillRows(skeleton, () => rows);
}

/** The declared box as a length: a row count builds it from tokens, a pixel constant or a CSS length is itself. */
function declaredBox({ reserveBlock, reserveRows }: DeclaredReserve): number | string | null {
  return reserveRows === undefined ? (reserveBlock ?? null) : skeletonLengthFor(reserveRows);
}

/** The skeleton refilled to a declared box: a row count is that count, a pixel constant is its pitch, and a CSS length leaves the skeleton as authored. */
function declaredSkeleton(skeleton: ReactNode, { reserveBlock, reserveRows }: DeclaredReserve): ReactNode {
  if (reserveRows !== undefined) {
    return fillRows(skeleton, () => reserveRows);
  }
  return typeof reserveBlock === "number" ? fillRows(skeleton, (authored) => skeletonRowCountFor(reserveBlock, authored)) : skeleton;
}

/** The keyed loading box. THREE SOURCES, ONE MECHANISM (#177): the measured box wins (what THIS device
 *  saw last settle); then the declared px constant; then nothing — the fallback renders unreserved and
 *  its own row count is the first-boot claim. EXACT (`blockSize`), not a floor: a remembered box
 *  SHORTER than the skeleton's natural height would otherwise still shrink when the read lands. The
 *  skeleton is decorative, so overflowing rows clip rather than push the box (a runtime measurement,
 *  not a design value — no token exists for "the height this surface happened to occupy"). */
function ReservedFallback({
  reserveKey,
  declared,
  fill,
  grow,
  children,
}: {
  readonly reserveKey: string;
  readonly declared: DeclaredReserve;
  readonly fill: boolean;
  readonly grow: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const measured = useSurfaceBox(reserveKey);
  const measuredRows = useSurfaceRows(reserveKey);
  const box = measured ?? declaredBox(declared);
  if (box === null) {
    return (
      <Stack grow={grow ? "onLandscape" : undefined} height={fill ? "fill" : undefined} minHeight={grow ? "holdsPickerOnLandscape" : undefined}>
        {children}
      </Stack>
    );
  }
  // The measured box refills from the row count remembered beside it, so a boot after the first reads no document.
  const skeleton = measured === null ? declaredSkeleton(children, declared) : fillRowsTo(children, measuredRows);
  return (
    <Stack
      className="overflow-clip"
      grow={grow ? "onLandscape" : undefined}
      minHeight={grow ? "holdsPickerOnLandscape" : undefined}
      reserve={grow ? "gives" : "exact"}
      reserveBlock={typeof box === "number" ? `${String(Math.round(box))}px` : box}
      data-reserve-key={reserveKey}
      data-tile-reserved={typeof box === "number" ? Math.round(box) : box}
      // WHICH source held the box open: "this device MEASURED it" is a different claim from "the mount
      // declared a constant" — a first-boot assertion reading only `data-tile-reserved` would silently
      // start passing for the wrong reason.
      data-tile-reserve-source={measured === null ? "declared" : "measured"}
    >
      {skeleton}
    </Stack>
  );
}

/** Wraps the SETTLED child and remembers the box it occupies for the next boot. A `ResizeObserver` records the
 *  body's laid-out height, not a passive-effect read: a child that renders twice to settle (a first pass, then a
 *  layout-effect trim) would otherwise be measured on its first pass. It also refreshes the memory when a child
 *  grows in place, and `surface-box-store`'s write epsilon swallows sub-pixel churn. */
function MeasuredSettle({
  reserveKey,
  fill,
  grow,
  children,
}: {
  readonly reserveKey: string;
  readonly fill: boolean;
  readonly grow: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (el === null) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const height = el.getBoundingClientRect().height;
      rememberSurfaceBox(reserveKey, height, skeletonRowCountFor(height, 1));
    });
    observer.observe(el);
    return (): void => observer.disconnect();
  }, [reserveKey]);
  return (
    <Stack grow={grow ? "onLandscape" : undefined} height={fill ? "fill" : undefined} minHeight={grow ? "holdsPickerOnLandscape" : undefined} ref={bodyRef}>
      {children}
    </Stack>
  );
}

export function QueryBoundary({
  fallback,
  reserveKey,
  reserveBlock,
  reserveRows,
  fill = false,
  grow = false,
  renderError = defaultRenderError,
  resetKeys,
  children,
}: QueryBoundaryProps): ReactElement {
  const landing = useRef<HTMLParagraphElement>(null);
  const declared: DeclaredReserve = reserveRows === undefined ? { reserveBlock } : { reserveRows };
  const reservedFallback =
    reserveKey === undefined ? (
      fallback
    ) : (
      <ReservedFallback declared={declared} fill={fill} grow={grow} reserveKey={reserveKey}>
        {fallback}
      </ReservedFallback>
    );
  const measuredChildren =
    reserveKey === undefined ? (
      children
    ) : (
      <MeasuredSettle fill={fill} grow={grow} reserveKey={reserveKey}>
        {children}
      </MeasuredSettle>
    );
  return (
    <QueryErrorResetBoundary>
      {({ reset }): ReactElement => (
        <QueryErrorCatch landing={landing} onReset={reset} renderError={renderError} resetKeys={resetKeys}>
          {(phase): ReactElement => (
            <Suspense fallback={<PendingFallback onPending={phase.onPending}>{reservedFallback}</PendingFallback>}>
              <QueryBoundaryScope value={true}>{settledChildren(phase, measuredChildren)}</QueryBoundaryScope>
            </Suspense>
          )}
        </QueryErrorCatch>
      )}
    </QueryErrorResetBoundary>
  );
}
