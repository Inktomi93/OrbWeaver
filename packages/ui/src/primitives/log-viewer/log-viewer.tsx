import type { ReactElement, UIEvent } from "react";
import { useLayoutEffect, useRef } from "react";
import { cn, prefersReducedMotionNow } from "#lib";
import { Button } from "#primitives/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve AlertTriangle/CircleAlert/Copy/Icon/Info fine (the spinner.tsx precedent).
import { AlertTriangle, CircleAlert, Copy, Icon, Info } from "#primitives/icons";
import type { MessageListHandle } from "#primitives/message-list";
import { MessageList } from "#primitives/message-list";
import { logViewerVariants } from "./variants";

// Levels declared ONCE as an `as const` tuple, union derived (§7.5 no-inline-union-redecl); both
// stay local — consumers name it via `LogLine["level"]` on the object form.
const LOG_LEVELS = ["info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_GLYPH: Record<LogLevel, typeof Info> = {
  info: Info,
  warn: AlertTriangle,
  error: CircleAlert,
};

// The glyph doubles as the accessible name for the level (Icon's `label` prop) — a second,
// non-visual signal alongside the intent-token color for the "never color alone" contract.
const LEVEL_LABEL: Record<LogLevel, string> = {
  info: "Info",
  warn: "Warning",
  error: "Error",
};

/**
 * A single log line: a plain string (unleveled, the common case) or `{ text, level }` for the
 * leveled treatment. Arrays may freely mix both forms.
 */
export type LogLine = string | { readonly text: string; readonly level?: LogLevel };

function textOf(line: LogLine): string {
  return typeof line === "string" ? line : line.text;
}

function levelOf(line: LogLine): LogLevel | undefined {
  return typeof line === "string" ? undefined : line.level;
}

// Above this many visible lines, the line region composes the `virtual-list` seal instead of
// mapping every line to a plain `<div>` (item 12's "virtualize when long"). Picked comfortably
// below the cited plugin ring buffer (256 lines, plugin-design/03 §3) so that consumer's
// near-full buffer windows, while a typical short log (a boot sequence, a handful of job lines)
// stays on the plain path and isn't forced into VirtualList's bounded-height discipline (D43
// §11.3) just to render a dozen `<div>`s.
const VIRTUALIZE_THRESHOLD = 200;

// Initial per-row size guess (px) for the virtualizer — rows re-measure themselves after mount
// (virtual-list's `measureElement` wiring), so this only needs to be roughly right for a
// single-wrap monospace line at the `text-code` scale.
const ESTIMATED_LINE_HEIGHT_PX = 24;

interface LogLineRowProps {
  readonly line: LogLine;
  readonly slots: ReturnType<typeof logViewerVariants>;
}

/** One rendered line — shared by the plain and virtualized paths so the markup lives once. */
function LogLineRow({ line, slots }: LogLineRowProps): ReactElement {
  const level = levelOf(line);
  return (
    <div
      data-log-line=""
      data-level={level}
      data-slot="log-viewer-line"
      className={slots.line({ level })}
    >
      {level === undefined ? null : (
        <Icon
          icon={LEVEL_GLYPH[level]}
          size="sm"
          label={LEVEL_LABEL[level]}
          className={slots.glyph()}
          data-slot="log-viewer-glyph"
        />
      )}
      <span>{textOf(line)}</span>
    </div>
  );
}

// "Near enough to the bottom to count as pinned" — a few px of slack absorbs sub-pixel scroll
// rounding so a reader sitting exactly at the bottom doesn't get read as "scrolled up" by a
// fraction of a pixel.
const NEAR_BOTTOM_SLACK_PX = 4;

// The virtualized-path tail threshold — mirrors message-list's own `DEFAULT_SCROLL_END_THRESHOLD_PX`
// (its `isAtEnd`/`followOnAppend` "within N px of the true end" reads as pinned). We recompute
// tail-proximity from the raw scroll node's live geometry (below) instead of the seal's `isAtEnd()`
// so the two stay semantically aligned but our read never depends on virtual-core's INTERNAL scroll
// offset being flushed first.
const VIRTUAL_TAIL_SLACK_PX = 80;

export interface LogViewerProps {
  readonly lines: readonly LogLine[];
  /** Cap the rendered window to the most recent N lines — a display cap; the caller owns the full log. */
  readonly maxLines?: number;
  readonly className?: string;
}

/**
 * LogViewer — a read-only monospace line panel (ui-package-design item 12). NOT the code-editor
 * seal: no editing, no CodeMirror, just lines. PIN-not-yank autoscroll on append (only re-scrolls
 * to the bottom when the reader is already there — a reader who has scrolled up to read history
 * is never yanked back down), a copy-to-clipboard affordance, and a `level` glyph+intent-token
 * pair per line (never color alone).
 *
 * The scrollable line region carries `role="log"` + `aria-live="polite"` — the streaming-log
 * accessibility contract (assistive tech announces new lines as they arrive). That role/live-region
 * pair lives on a STABLE wrapper in both paths below — never on the windowed rows themselves — so
 * announcements keep working once the panel is virtualized (the plain path stamps it on its own
 * scroll `<div>`; the virtualized path inherits it from the `message-list` seal, whose scroll
 * wrapper carries the same pair). On the plain path `tabIndex={0}` also makes the region
 * keyboard-scrollable (WCAG 2.1.1 — arrow/Page keys scroll a focused overflow container even with
 * no other focusable descendant).
 *
 * At/above `VIRTUALIZE_THRESHOLD` visible lines, the line region composes the `message-list` seal
 * (NOT the lower-level `virtual-list`): message-list's `anchorTo:"end"` + `followOnAppend` is the
 * pin-not-yank autoscroll expressed correctly for a virtualized list — it re-checks `isAtEnd()`
 * before following, so a reader scrolled up is never yanked. `followOnAppend` only fires when the
 * item COUNT grows, so a `maxLines`-full ring buffer (constant length, sliding content) needs an
 * explicit tail-follow — driven here off `isAtEnd()`/`scrollToEnd()` on the seal's handle, gated by
 * the same "was the reader at the tail" check (see the autoscroll effect below). That path inherits
 * message-list's bounded-height requirement (D43 §11.3 — give the panel a real height via
 * `className`, e.g. `h-64`, or it throws); below the threshold, lines render plainly and no bounded
 * height is required, matching today's behavior for the common short-log case.
 *
 * Usage: `<LogViewer lines={logLines} maxLines={256} className="h-64" />`
 */
export function LogViewer({ lines, maxLines, className }: LogViewerProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Updated from `onScroll` (a real user/native scroll), never from the autoscroll effect itself —
  // so it reflects "was the reader at the bottom BEFORE this append", not "did we just force them
  // there". Starts `true`: an empty/short log begins pinned, matching pre-existing behavior.
  const isNearBottomRef = useRef(true);
  const visible = maxLines === undefined ? lines : lines.slice(-maxLines);
  const slots = logViewerVariants();
  const shouldVirtualize = visible.length >= VIRTUALIZE_THRESHOLD;
  // Stable per-line identity across a sliding `maxLines` window: `lines.slice(-maxLines)`
  // recomputes the visible slice fresh every render, so a plain visible-index key would
  // misattribute a row's identity to the WRONG line whenever the window slides off older lines —
  // exactly the "index keys break prepend stability" case message-list's own `getItemKey` docs
  // warn about. Offsetting by how far the window has slid gives each line a key that's stable for
  // its whole life; with no `maxLines` (or before the buffer fills), offset is 0 and this degrades
  // to the plain append-only index.
  const keyOffset = lines.length - visible.length;

  // The virtualized-path pin state. `listHandleRef` reaches message-list's imperative handle
  // (`isAtEnd`/`scrollToEnd`); `wasAtEndRef` mirrors the plain path's `isNearBottomRef` — updated
  // ONLY from a real scroll on the seal's scroll node (below), so at append time it still reflects
  // "was the reader at the tail BEFORE this line landed", never "did we just follow them there".
  // Starts `true` so a fresh panel begins pinned.
  const listHandleRef = useRef<MessageListHandle | null>(null);
  const wasAtEndRef = useRef(true);
  const virtualScrollNodeRef = useRef<HTMLDivElement | null>(null);
  // Stable handler (useRef initializer runs once): add/removeEventListener must pass the SAME
  // reference or a re-registration would leak listeners. Reads only refs, so it never goes stale.
  // Computes tail-proximity from the scroll node's LIVE geometry (the same read as the plain path's
  // `handleScroll`) rather than the seal's `isAtEnd()`: virtual-core's `isAtEnd` reads its OWN cached
  // scroll offset, updated by virtual-core's own scroll listener on the same node — so calling it
  // from a sibling scroll listener races that update and can still see the pre-scroll (bottomed)
  // offset, wrongly reading a reader who just scrolled up as "at the tail" and yanking them on the
  // next append. The DOM geometry here is always current at event time.
  const handleVirtualScrollRef = useRef((): void => {
    const node = virtualScrollNodeRef.current;
    wasAtEndRef.current =
      node === null ||
      node.scrollHeight - node.scrollTop - node.clientHeight <= VIRTUAL_TAIL_SLACK_PX;
  });

  // Attaches the scroll listener to message-list's real scroll node (its `scrollContainerRef`
  // escape hatch). Removes from the prior node first so a node swap never double-binds.
  const registerVirtualScrollNode = (node: HTMLDivElement | null): void => {
    const previous = virtualScrollNodeRef.current;
    if (previous !== null) {
      previous.removeEventListener("scroll", handleVirtualScrollRef.current);
    }
    virtualScrollNodeRef.current = node;
    if (node !== null) {
      node.addEventListener("scroll", handleVirtualScrollRef.current, { passive: true });
    }
  };

  // The "did the rendered content actually change" guard — content, not just re-render, drives
  // the scroll (a signature over length + last line beats deep-comparing the whole array).
  const lastLine = visible.at(-1);
  const contentSignature = `${visible.length}:${lastLine === undefined ? "" : textOf(lastLine)}`;
  const previousSignatureRef = useRef<string | null>(null);

  // PIN-not-yank autoscroll: an append only re-scrolls the line region to its new bottom when the
  // reader was ALREADY at/near the bottom — a reader scrolled up to read history is never yanked
  // back down. No dependency array (runs every commit) + an internal signature guard, since the
  // effect body itself doesn't reference `visible`/`contentSignature` directly (exhaustive-deps
  // would flag them as unused deps otherwise).
  //
  // PLAIN path: gate on `isNearBottomRef` (kept current by `handleScroll` below) and scroll the
  // real overflow `<div>`. `behavior` passed explicitly to `scrollTo` overrides the global
  // reduced-motion CSS floor (styles/globals.css forces `scroll-behavior: auto` only for
  // CSS-triggered scrolls), so the reduced-motion check happens here via `matchMedia` directly.
  //
  // VIRTUALIZED path: message-list's own `anchorTo:"end"` + `followOnAppend` already sticks to the
  // tail whenever the item COUNT grows (and never yanks a scrolled-up reader — it re-checks
  // `isAtEnd()` itself). The one case it can't cover is a `maxLines`-full ring buffer: the count is
  // CONSTANT while content slides, so `followOnAppend` (gated on `nextCount > prevCount`) never
  // re-fires. Drive that case explicitly via the handle's `scrollToEnd()` (which respects
  // reduced-motion), gated by the same `wasAtEndRef` "were they at the tail" check so a scrolled-up
  // reader stays put.
  useLayoutEffect(() => {
    if (previousSignatureRef.current === contentSignature) {
      return;
    }
    previousSignatureRef.current = contentSignature;
    if (shouldVirtualize) {
      if (wasAtEndRef.current) {
        listHandleRef.current?.scrollToEnd();
      }
      return;
    }
    const el = scrollRef.current;
    if (el === null || !isNearBottomRef.current) {
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotionNow() ? "auto" : "smooth" });
  });

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_SLACK_PX;
  };

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(visible.map(textOf).join("\n"));
  };

  return (
    <div className={cn(slots.root(), className)} data-slot="log-viewer-root">
      <div className={slots.toolbar()} data-slot="log-viewer-toolbar">
        <Button type="button" intent="ghost" size="sm" onClick={handleCopy}>
          <Icon icon={Copy} size="sm" label="Copy log" />
        </Button>
      </div>
      {shouldVirtualize ? (
        // The virtualized path IS a message-list — it owns the scroll container plus the same
        // `role="log"`/`aria-live="polite"` stable wrapper (message-list cites this seal's
        // precedent), so it is NOT wrapped in a second `role="log"` div. `scrollContainerRef`
        // hands us the real scroll node to track tail-proximity for the ring-buffer follow above.
        <MessageList
          ref={listHandleRef}
          items={visible}
          getItemKey={(_line, index): number => keyOffset + index}
          estimateSize={(): number => ESTIMATED_LINE_HEIGHT_PX}
          renderItem={(line): ReactElement => <LogLineRow line={line} slots={slots} />}
          scrollContainerRef={registerVirtualScrollNode}
          // This seal owns its OWN pin-not-yank logic (`wasAtEndRef` + the autoscroll effect above,
          // driving `scrollToEnd()` on the handle), including the ring-buffer follow. Opt OUT of
          // message-list's built-in tail-follow so the two don't both drive the scroll.
          followTail={false}
          className={slots.scroll()}
        />
      ) : (
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG 2.1.1 keyboard-scrollable overflow region — tabIndex=0 makes arrow/Page-key scrolling reachable without a mouse; not an accidental tab-stop.
          tabIndex={0} // eslint-disable-line jsx-a11y/no-noninteractive-tabindex -- same justification as the biome-ignore above
          onScroll={handleScroll}
          className={slots.scroll()}
          data-slot="log-viewer-scroll"
        >
          {visible.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: an append-only log tail (lines are never reordered/removed from the middle) — position is a stable identity.
            <LogLineRow key={index} line={line} slots={slots} />
          ))}
        </div>
      )}
    </div>
  );
}
