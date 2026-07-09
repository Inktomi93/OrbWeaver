import type { Range } from "@tanstack/react-virtual";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { ReactElement, ReactNode, Ref } from "react";
import { useImperativeHandle, useLayoutEffect, useRef } from "react";
import { cn } from "#lib";
import { TOKENS } from "#tokens";

// Same intent-token gap contract as the virtual-list seal (kept as a small local duplicate rather
// than a cross-import — the two sealed dirs each own their own tiny gap-token→px conversion; see
// the primitive contract §2.2 "intra-package composition" note, which permits but doesn't require
// sharing between sibling seals, and this is a 6-line helper, not shared state).
const GAP_TOKENS = ["field", "row", "block", "section", "gutter"] as const;
type MessageListGapToken = (typeof GAP_TOKENS)[number];
const ROOT_FONT_SIZE_PX = 16;

// Chat rows run tall and variable (multi-paragraph messages); a deeper overscan than the generic
// virtual-list default avoids pop-in on quick scrollback (the neo message-list-surface precedent).
const DEFAULT_OVERSCAN = 10;

// D43 §11.3 tripwire, identical to virtual-list — an unbounded scroll container makes windowing a
// no-op and must THROW, not warn.
const UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER = 3;

// virtual-core's own chat-example default (verified against the TanStack Virtual chat guide, R8):
// "within N px of the true end" reads as pinned. 1px (the library's generic default) is too tight
// for real content — sub-pixel layout rounding would constantly misclassify a bottomed-out reader
// as "scrolled away."
const DEFAULT_SCROLL_END_THRESHOLD_PX = 80;

function gapPxFor(token: MessageListGapToken): number {
  return Number.parseFloat(TOKENS[`spacing.${token}`].value) * ROOT_FONT_SIZE_PX;
}

// The PD-119 keep-mounted composition. `keepMounted` unions the indices of the matched items ON TOP
// of a BASE window — the base being the caller's own `rangeExtractor` when supplied (keepMounted
// composes WITH it, never replaces it: the caller's extractor computes the scroll window, then the
// pinned indices are added), else virtual-core's own `defaultRangeExtractor`. The union is de-duped
// and sorted ascending because virtual-core's `calculateRange` consumers require a sorted index list
// (verified against `@tanstack/virtual-core@3.17.3` — `defaultRangeExtractor` returns ascending, and
// forced indices out of order render at the wrong absolute offset). A forced index appears in
// `getVirtualItems()` and stays positioned by its own measurement regardless of scroll distance
// (the `measurementsCache` covers every index up front), so its row is a REAL mounted DOM node that
// never unmounts — the exact property a stateful row (edit-in-place local state, a Tier-B
// `sandbox-frame` iframe) needs to survive scroll-away. Returns `undefined` when neither input is
// set, so the plain library default stays in force with no wrapper allocation. The CALLER owns the
// pinning policy — cap the matched set so it can't silently defeat virtualization.
function composeRangeExtractor<T>(
  items: readonly T[],
  keepMounted: ((item: T) => boolean) | undefined,
  rangeExtractor: ((range: Range) => number[]) | undefined,
): ((range: Range) => number[]) | undefined {
  if (keepMounted === undefined) {
    return rangeExtractor;
  }
  const forced: number[] = [];
  for (const [index, item] of items.entries()) {
    if (keepMounted(item)) {
      forced.push(index);
    }
  }
  const base = rangeExtractor ?? defaultRangeExtractor;
  return (range: Range): number[] => {
    const union = new Set<number>(base(range));
    for (const index of forced) {
      union.add(index);
    }
    return Array.from(union).sort((a, b) => a - b);
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface MessageListHandle {
  /** Whether the viewport is currently pinned to the tail (virtual-core's own scroll-end threshold). */
  readonly isAtEnd: () => boolean;
  /**
   * Pixel distance between the current scroll position and the TRUE end of the list
   * (virtual-core's own `getDistanceFromEnd` — accounts for measured vs. estimated row sizes the
   * same way `isAtEnd` does). Drives a "reading history" / "N new messages" readout; this seal only
   * reports the number — the feature composes the copy, threshold, and badge/button.
   */
  readonly getDistanceFromEnd: () => number;
  /** The "jump to latest" action — imperatively scrolls to the last item. */
  readonly scrollToEnd: () => void;
}

// PD-119 (SHIPPED): this seal is pure WINDOWED virtualization BY DEFAULT — rows mount/unmount on
// scroll, and a stable `getItemKey` alone does NOT keep an off-screen row mounted (a Tier-B
// `sandbox-frame` iframe reloads on scroll-back; edit-in-place local state drops — neo's
// virtualizer footgun). The first-class opt-out is the `keepMounted` predicate below: a caller
// names WHICH items must stay mounted (the currently-edited row, a row with a live iframe, a capped
// set), and the seal forces their indices into the rendered range via the composed `rangeExtractor`
// (`composeRangeExtractor` above). A pinned row stays a REAL mounted DOM node at its correct
// absolute offset regardless of scroll distance, so its own local React state survives scroll-away
// without being hoisted to an external store. The keep-mounted MECHANISM (an index forced into the
// range persists off-screen) is the SAME escape hatch sealed + CT-proven on `virtual-list`;
// `keepMounted` is the item-space policy surface over it, CT-proven here against a stateful input
// row (state SURVIVES with `keepMounted` matching the row, is LOST without it). The caller owns the
// pinning POLICY — cap the matched set so pinning can't silently defeat virtualization, and note
// that heavy pinning composes with `anchorTo: "end"` (pinned rows above the viewport do not move
// the tail anchor, they just stay mounted at their own offset).
export interface MessageListProps<T> {
  readonly items: readonly T[];
  /**
   * Stable per-item key — MUST be id-based (never the index). Chat histories both append (new
   * turns) and prepend (loading older history); an id key is what lets the virtualizer's
   * measurement cache and the bottom-anchor survive a prepend without re-measuring or losing the
   * reader's place (the same discipline as virtual-list's `getItemKey`).
   */
  readonly getItemKey: (item: T, index: number) => string | number;
  /** Initial size guess per row (px, main axis) — rows re-measure themselves after mount. */
  readonly estimateSize: (index: number) => number;
  /** Rows rendered beyond the visible window on each side. Defaults deeper than virtual-list's
   *  (10) — chat rows are tall/variable, so a shallow overscan flashes rows in on scrollback. */
  readonly overscan?: number;
  /** Gap between rows as a spacing intent token. */
  readonly gapToken?: MessageListGapToken;
  /** How close to the true end (px) still counts as "pinned" for `followOnAppend`/`isAtEnd`. */
  readonly scrollEndThreshold?: number;
  /**
   * Overrides which indices render for the current scroll range — the SAME `rangeExtractor` escape
   * hatch sealed on `virtual-list` (see its own doc), the low-level index-space form. When
   * `keepMounted` is ALSO set, this extractor is the BASE window and the pinned indices are unioned
   * on top of it (they compose — see `keepMounted`); when it is omitted, virtual-core's own
   * `defaultRangeExtractor` is the base. Most callers want `keepMounted` (item-space) instead of
   * this; reach for `rangeExtractor` only to reshape the whole window itself. Omit both for the
   * library default (a plain overscan-padded contiguous range).
   */
  readonly rangeExtractor?: (range: Range) => number[];
  /**
   * The PD-119 keep-mounted path (SHIPPED): a predicate naming WHICH items must stay mounted even
   * when scrolled far outside the overscan window. Every matched item's index is forced into the
   * rendered range (composed with `rangeExtractor` if supplied, else the library default — see the
   * `composeRangeExtractor` helper), so its row stays a REAL mounted DOM node at its correct
   * absolute offset and its own local React state (an edit-in-place textarea, a Tier-B
   * `sandbox-frame` iframe) survives scroll-away WITHOUT being hoisted to an external store.
   * Item-space (not index-space): the seal derives the indices from `items` itself, so the caller
   * expresses policy against its own domain objects. The CALLER owns the pinning policy — cap the
   * matched set (e.g. only the currently-edited row) so pinning can't silently defeat
   * virtualization. Omit for the pure-windowed default.
   */
  readonly keepMounted?: (item: T) => boolean;
  /**
   * Passthrough for virtual-core's `useCachedMeasurements` (verified against the shipped
   * `dist/esm/index.js`'s default `measureElement`: when true, EVERY measurement call — the
   * mount-time ref AND every ResizeObserver-driven resize alike — short-circuits to the cached
   * size (or the initial `estimateSize` guess if nothing is cached yet); the real DOM box is never
   * read. That is a STATIC, unconditional bypass, not an automatic "cache while hidden, measure
   * while visible" switch — so a caller must flip this prop itself across renders. That's exactly
   * how it's meant to be driven: virtual-core re-applies `setOptions` on every render (verified in
   * `@tanstack/react-virtual`'s `useVirtualizer` — `instance.setOptions(resolvedOptions)` runs
   * unconditionally each call), so passing a value that changes across renders takes effect live,
   * not just at mount.
   *
   * The intended composition (§4a/§5.1): the chat feature keeps this list mounted-but-hidden via
   * React 19's `<Activity>` on pane flip-away, and passes `true` only while its OWN mode is
   * `"hidden"`. A hidden pane's layout collapse fires the ResizeObserver with a size-0 entry, which
   * — without this flag — would wipe every row's measured height and force a re-measure +
   * scroll-jump when the pane comes back. With it, the last-good cached height rides through
   * untouched. Default `false` so a normal VISIBLE list keeps re-measuring growing streaming rows
   * for real.
   */
  readonly useCachedMeasurements?: boolean;
  readonly renderItem: (item: T, index: number) => ReactNode;
  /** Caller-owned sizing/skin for the scroll container — the BOUNDED height comes from here. */
  readonly className?: string;
  /**
   * An escape hatch to the real scrolling DOM node. The list owns no scroll-restoration logic
   * itself (domain/router-agnostic — it doesn't know what a "chat" or a "route" is), but a real
   * `overflow: auto` element with native `scrollTop` is exactly what an external scroll-restoration
   * hook (e.g. a router's `useElementScrollRestoration`) or an `IntersectionObserver` needs to
   * attach to. Pair this ref with that hook at the call site.
   */
  readonly scrollContainerRef?: Ref<HTMLDivElement>;
  /** Imperative handle (`isAtEnd`/`getDistanceFromEnd`/`scrollToEnd`) — React 19 ref-as-prop, no
   *  `forwardRef`. */
  readonly ref?: Ref<MessageListHandle>;
}

/**
 * The `@tanstack/react-virtual` chat-thread seal (ui-package-design §6.1/§9 — the `message-list`
 * row, un-parked). Builds on the SAME discipline as `virtual-list` (`directDomUpdates: true` +
 * `containerRef`, `useFlushSync: false`, `directDomUpdatesMode: "position"`, the unbounded-height
 * tripwire), plus the chat-specific bottom-anchor behavior virtual-core ships for exactly this case:
 *
 * - **Bottom-anchored on mount** — an explicit `virtualizer.scrollToEnd()` in a mount-only
 *   `useLayoutEffect`, the pattern the TanStack Virtual maintainers recommend (R8 — verified live;
 *   `anchorTo`/`followOnAppend` alone do NOT auto-scroll on first paint, they only govern behavior
 *   AFTER mount). Always instant (`behavior: "auto"`) regardless of motion pref — a chat opening
 *   scrolled to the top and animating down to the tail would itself be the jarring motion.
 * - **Stick-to-bottom on append** (`anchorTo: "end"` + `followOnAppend`) — virtual-core re-checks
 *   `isAtEnd()` (within `scrollEndThreshold` px of the true end) AND that the last item's key
 *   actually changed before it scrolls; a reader who has scrolled up to read history is never
 *   yanked back down by a new item landing below. `prefers-reduced-motion` swaps the follow
 *   behavior from `"smooth"` to `"auto"` (immediate, no animation) rather than skipping the follow
 *   entirely — the list still tracks the tail, it just doesn't animate the jump.
 * - **`measureElement` + `data-index`** on every row reserves each row's box and re-measures it
 *   after paint, so variable-height messages (one line vs. many paragraphs) don't reflow the whole
 *   list — the same wiring as virtual-list. `anchorTo: "end"` also keeps the tail pinned as
 *   estimates are replaced by real measurements (virtual-core's own resize-adjustment, not
 *   `followOnAppend`), so the mount-time `scrollToEnd()` doesn't drift once rows settle.
 * - Domain-agnostic: takes `items` + `renderItem` + `getItemKey` only. It has no idea what a
 *   "message" or a "chat" is — the chat-client chunk supplies ghost-row and ordinary-row rendering
 *   entirely through `renderItem`.
 * - **`role="log"` + `aria-live="polite"`** on the stable scroll wrapper (the log-viewer.tsx
 *   precedent) — assistive tech announces arriving messages without depending on the windowed rows
 *   themselves, which mount/unmount as the reader scrolls.
 * - **`isAtEnd()` / `getDistanceFromEnd()` / `scrollToEnd()`** on the imperative handle are the
 *   "jump to latest" / reading-history primitives (§A.4/§F.6) — plain numbers/actions only; the
 *   chat feature composes the badge copy, the threshold, and the button.
 * - **`useCachedMeasurements` / `rangeExtractor` / `keepMounted`** complete the seal against the
 *   full TanStack Virtual option surface plus the PD-119 keep-mounted path. `useCachedMeasurements`
 *   (default `false`) is the `<Activity>`-hidden-pane measurement-cache freeze (§4a/§5.1 — see its
 *   prop doc for the exact, source-verified semantics — it is a static bypass a caller must toggle
 *   live, not a "smart" hidden-only mode). `keepMounted(item)` (SHIPPED, PD-119 — see the note
 *   above `MessageListProps`) is the first-class opt-out from unmount-on-scroll for stateful rows:
 *   matched items' indices are forced into the rendered range so an off-screen edit-in-place / Tier-B
 *   iframe row stays mounted and keeps its own local state. `rangeExtractor` is the low-level
 *   index-space form it composes over (the same escape hatch sealed + CT-proven on `virtual-list`).
 *
 * Usage:
 * ```tsx
 * <MessageList
 *   items={messages}
 *   getItemKey={(m) => m.id}
 *   estimateSize={() => estimatedRowPx}
 *   renderItem={(m) => <MessageRow message={m} />}
 *   className="h-full"
 * />
 * ```
 */
export function MessageList<T>({
  items,
  getItemKey,
  estimateSize,
  overscan = DEFAULT_OVERSCAN,
  gapToken,
  scrollEndThreshold = DEFAULT_SCROLL_END_THRESHOLD_PX,
  rangeExtractor,
  keepMounted,
  useCachedMeasurements = false,
  renderItem,
  className,
  scrollContainerRef,
  ref,
}: MessageListProps<T>): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const itemAt = (index: number): T => {
    const item = items.at(index);
    if (item === undefined) {
      throw new Error(`MessageList: virtual index ${index} has no backing item`);
    }
    return item;
  };

  // PD-119: `keepMounted` (item-space) composes WITH any caller `rangeExtractor` (index-space) into
  // one sorted, de-duped extractor — see `composeRangeExtractor`. `undefined` when neither is set.
  const composedRangeExtractor = composeRangeExtractor(items, keepMounted, rangeExtractor);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan,
    gap: gapToken === undefined ? 0 : gapPxFor(gapToken),
    getItemKey: (index) => getItemKey(itemAt(index), index),
    // Conditionally spread (not a bare `rangeExtractor` key): `exactOptionalPropertyTypes`
    // distinguishes an omitted optional property from one explicitly set to `undefined` — the same
    // guard virtual-list uses for its own optional passthroughs.
    ...(composedRangeExtractor === undefined ? {} : { rangeExtractor: composedRangeExtractor }),
    // The chat-thread anchor pair (verified against virtual-core@3.17's pendingScrollAnchor path):
    // `followOnAppend` only fires when the viewport was already at the end AND the item count grew
    // AND the last key actually changed — so it never fights a reader who scrolled up.
    anchorTo: "end",
    followOnAppend: prefersReducedMotion() ? true : "smooth",
    scrollEndThreshold,
    // `<Activity>`-hidden-pane measurement freeze (§4a/§5.1) — see the prop doc above for the
    // exact, source-verified semantics. Defaults false so a visible list always measures for real.
    useCachedMeasurements,
    directDomUpdates: true,
    // Transform mode wraps every row in its own compositor layer (a NEW stacking context) that can
    // break `position:fixed`/portaled descendants. Message rows are the future home of Tier-B
    // `sandbox-frame` iframes and portaled overlays (edit-in-place, PD-119/#25); `position` mode
    // (plain `top` writes, no stacking context) is the correct default for THIS seal, even at the
    // cost of transform mode's own compositor-layer scroll smoothness.
    directDomUpdatesMode: "position",
    useFlushSync: false,
  });

  // Bottom-anchored initial render (R8 — verified against the TanStack Virtual maintainers'
  // recommended pattern for GitHub discussion #911 "how to scroll to bottom of a list at init":
  // `anchorTo`/`followOnAppend` alone only govern POST-mount behavior; the first paint needs an
  // explicit nudge). `virtualizer`'s identity is stable across re-renders (a ref-held instance), so
  // this fires once per mount despite the dependency array.
  useLayoutEffect(() => {
    virtualizer.scrollToEnd({ behavior: "auto" });
  }, [virtualizer]);

  useImperativeHandle(
    ref,
    (): MessageListHandle => ({
      isAtEnd: () => virtualizer.isAtEnd(),
      getDistanceFromEnd: () => virtualizer.getDistanceFromEnd(),
      scrollToEnd: () =>
        virtualizer.scrollToEnd({ behavior: prefersReducedMotion() ? "auto" : "smooth" }),
    }),
    [virtualizer],
  );

  // The unbounded-window tripwire (D43 §11.3) — thrown, not warned. Identical to virtual-list.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const maxHeightPx = window.innerHeight * UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER;
    const measuredPx = el.getBoundingClientRect().height;
    if (measuredPx > maxHeightPx) {
      throw new Error(
        `MessageList: the scroll container measured ${Math.round(measuredPx)}px tall — over ` +
          `${UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER}× the viewport (${Math.round(maxHeightPx)}px). ` +
          "The parent gave the list no bounded height, so every row is 'visible' and " +
          "virtualization is a no-op. Fix: constrain the parent (e.g. h-full inside a sized " +
          "layout region) so the list scrolls inside a real window.",
      );
    }
  }, []);

  return (
    <div
      ref={(node): void => {
        scrollRef.current = node;
        if (typeof scrollContainerRef === "function") {
          scrollContainerRef(node);
        } else if (scrollContainerRef) {
          scrollContainerRef.current = node;
        }
      }}
      // role="log" + aria-live="polite" on this STABLE outer node (never remounted — the same
      // log-viewer.tsx precedent, MEETS-BAR per the rigor audit): assistive tech announces each
      // arriving message the way a chat transcript should. Kept off the windowed rows themselves,
      // which mount/unmount as the reader scrolls.
      role="log"
      aria-live="polite"
      className={cn("overflow-auto overscroll-contain", className)}
      data-slot="message-list-scroll"
    >
      <div
        ref={virtualizer.containerRef}
        className="relative w-full"
        data-slot="message-list-viewport"
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          // Rows are position:absolute WITHOUT their own main-axis position — directDomUpdates
          // ("position" mode) writes `top` straight to the DOM; setting it here would fight it.
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: virtualized off-screen metadata
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-slot="message-list-row"
            className="absolute inset-x-0"
            aria-setsize={items.length}
            aria-posinset={virtualItem.index + 1}
          >
            {renderItem(itemAt(virtualItem.index), virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
