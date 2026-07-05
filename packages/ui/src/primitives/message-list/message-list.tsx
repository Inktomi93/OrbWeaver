import type { Range } from "@tanstack/react-virtual";
import { useVirtualizer } from "@tanstack/react-virtual";
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

// FLAG[PD-119]: this seal is pure WINDOWED virtualization BY DEFAULT — rows mount/unmount on
// scroll, and a stable `getItemKey` alone does NOT keep an off-screen row mounted (a Tier-B
// `sandbox-frame` iframe reloads on scroll-back; edit-in-place local state drops — neo's
// virtualizer footgun). UI-Gates §11.3 / UI-Theming §12.2 over-claimed this as built; the docs
// were corrected 2026-07-04c.
//
// 2026-07-04d re-audit (Task #26): the generic MECHANISM for keep-mounted now exists here — the
// `rangeExtractor` passthrough below is the SAME escape hatch already sealed + CT-proven on
// `virtual-list` ("rangeExtractor passthrough: a custom extractor's forced index stays mounted
// off-screen"). Forcing extra indices into the rendered range keeps them REAL mounted DOM nodes at
// their correct absolute position regardless of scroll distance, because `measurementsCache`
// covers every index up front (verified against the shipped `@tanstack/virtual-core@3.17.3`
// `dist/esm/index.js` — `resizeItem`/`getVirtualItems` place items by absolute index, not by
// proximity to the current viewport). That much is zero-risk and landed dormant (unused unless a
// caller supplies one).
//
// What's still UNBUILT here, deliberately NOT guessed (that's task #25's job): the POLICY of WHICH
// rows get pinned (the currently-edited row only? every row with a live iframe? a capped set?),
// how a caller expresses that policy (a `rangeExtractor` runs in INDEX space — a real consumer
// needs to translate its own "pinned ids" into indices from `items` itself, and cap the pinned set
// so it can't silently defeat virtualization), and how that interacts with `anchorTo: "end"` under
// heavy pinning. Guessing that shape now risks locking in the wrong API before #25's actual
// consumer exists. Until #25 lands, stateful-row consumers MUST ALSO keep hoisting row state to an
// external store keyed by message id — the `rangeExtractor` mechanism only stops the unmount, it
// does not, by itself, solve state loss.
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
   * hatch sealed on `virtual-list` (see its own doc), passed straight through unmodified. Lets a
   * caller force additional indices to stay mounted outside the normal overscan window (the
   * PD-119 keep-mounted MECHANISM — see the FLAG above for what's built vs. still a task-#25
   * policy decision). Omit for the library default (a plain overscan-padded contiguous range);
   * this seal does not invent its own pinning policy.
   */
  readonly rangeExtractor?: (range: Range) => number[];
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
 * - **`useCachedMeasurements` / `rangeExtractor`** complete the seal against the full TanStack
 *   Virtual option surface (Task #26 audit). `useCachedMeasurements` (default `false`) is the
 *   `<Activity>`-hidden-pane measurement-cache freeze (§4a/§5.1 — see its prop doc for the exact,
 *   source-verified semantics — it is a static bypass a caller must toggle live, not a "smart"
 *   hidden-only mode). `rangeExtractor` is the generic keep-mounted-off-screen escape hatch already
 *   sealed + CT-proven on `virtual-list`; it's dormant here (PD-119 — see the FLAG above) until a
 *   real consumer (task #25) supplies its own pinning policy.
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
    ...(rangeExtractor === undefined ? {} : { rangeExtractor }),
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
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            data-slot="message-list-row"
            className="absolute inset-x-0"
          >
            {renderItem(itemAt(virtualItem.index), virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
