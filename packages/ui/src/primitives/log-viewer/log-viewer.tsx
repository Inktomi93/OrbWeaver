import type { ReactElement, UIEvent } from "react";
import { useLayoutEffect, useRef } from "react";
import { cn, prefersReducedMotionNow } from "#lib";
import { CopyButton } from "#primitives/copy-button";
import { AlertTriangle, CircleAlert, Icon, Info } from "#primitives/icons";
import type { MessageListHandle } from "#primitives/message-list";
import { MessageList } from "#primitives/message-list";
import { logViewerVariants } from "./variants.ts";

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

// Above this many visible lines, the line region virtualizes instead of mapping every line to a
// plain `<div>`; a typical short log stays on the plain path and skips the bounded-height requirement.
const VIRTUALIZE_THRESHOLD = 200;

// Initial per-row size guess (px) — rows re-measure themselves after mount.
const ESTIMATED_LINE_HEIGHT_PX = 24;

interface LogLineRowProps {
  readonly line: LogLine;
  readonly slots: ReturnType<typeof logViewerVariants>;
}

/** One rendered line — shared by the plain and virtualized paths so the markup lives once. */
function LogLineRow({ line, slots }: LogLineRowProps): ReactElement {
  const level = levelOf(line);
  return (
    <div data-log-line="" data-level={level} data-slot="log-viewer-line" className={slots.line({ level })}>
      {level === undefined ? null : (
        <Icon icon={LEVEL_GLYPH[level]} size="sm" label={LEVEL_LABEL[level]} className={slots.glyph()} data-slot="log-viewer-glyph" />
      )}
      <span>{textOf(line)}</span>
    </div>
  );
}

// Slack absorbing sub-pixel scroll rounding so a reader exactly at bottom isn't read as "scrolled up".
const NEAR_BOTTOM_SLACK_PX = 4;

// Tail threshold for the virtualized path — recomputed from the raw scroll node's live geometry
// rather than message-list's own isAtEnd(), so it never depends on virtual-core's internal offset
// being flushed first.
const VIRTUAL_TAIL_SLACK_PX = 80;

export interface LogViewerProps {
  readonly lines: readonly LogLine[];
  /** Cap the rendered window to the most recent N lines — a display cap; the caller owns the full log. */
  readonly maxLines?: number;
  readonly className?: string;
}

/**
 * LogViewer — a read-only monospace line panel. PIN-not-yank autoscroll on append (never yanks a
 * reader who scrolled up to read history), a copy-to-clipboard affordance, and a `level`
 * glyph+intent-token pair per line (never color alone). Virtualizes above `VIRTUALIZE_THRESHOLD`
 * lines via `message-list`, which then requires a bounded height on `className` (e.g. `h-64`).
 */
export function LogViewer({ lines, maxLines, className }: LogViewerProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Updated only from a real scroll event, never from the autoscroll effect — reflects "was the
  // reader at the bottom before this append". Starts true: an empty/short log begins pinned.
  const isNearBottomRef = useRef(true);
  const visible = maxLines === undefined ? lines : lines.slice(-maxLines);
  const slots = logViewerVariants();
  const shouldVirtualize = visible.length >= VIRTUALIZE_THRESHOLD;
  // Offset by how far a sliding `maxLines` window has moved, so a line's key stays stable across
  // its whole life instead of misattributing to a plain visible-index as the window slides.
  const keyOffset = lines.length - visible.length;

  const listHandleRef = useRef<MessageListHandle | null>(null);
  // Mirrors isNearBottomRef for the virtualized path — updated only from a real scroll.
  const wasAtEndRef = useRef(true);
  const virtualScrollNodeRef = useRef<HTMLDivElement | null>(null);
  // Computes tail-proximity from the scroll node's live geometry rather than message-list's own
  // isAtEnd(), which reads its own cached offset and can race a sibling scroll listener, wrongly
  // reading a reader who just scrolled up as "at the tail" and yanking them on the next append.
  const handleVirtualScrollRef = useRef((): void => {
    const node = virtualScrollNodeRef.current;
    wasAtEndRef.current = node === null || node.scrollHeight - node.scrollTop - node.clientHeight <= VIRTUAL_TAIL_SLACK_PX;
  });

  // Removes from the prior node first so a node swap never double-binds.
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

  // Content signature (length + last line) so the effect below fires on real content change, not
  // every re-render, without a dependency array (its body doesn't reference these directly).
  const lastLine = visible.at(-1);
  const contentSignature = `${visible.length}:${lastLine === undefined ? "" : textOf(lastLine)}`;
  const previousSignatureRef = useRef<string | null>(null);

  // PIN-not-yank autoscroll: only re-scrolls when the reader was already at/near the bottom.
  // Virtualized path also drives scrollToEnd() explicitly for a maxLines ring buffer, whose
  // constant count never re-triggers message-list's own followOnAppend.
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
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_SLACK_PX;
  };

  return (
    <div className={cn(slots.root(), className)} data-slot="log-viewer-root">
      <div className={slots.toolbar()} data-slot="log-viewer-toolbar">
        <CopyButton className={slots.copy()} iconOnly={true} intent="ghost" text={visible.map(textOf).join("\n")} what="log" />
      </div>
      {shouldVirtualize ? (
        // message-list already owns the scroll container + the role="log"/live-region pair (its liveness
        // is the TAIL ROW — announce.ts), so this is NOT wrapped in a second role="log" div. The plain
        // arm below keeps its container-level `aria-live`: it is append-only and mounts no history.
        <MessageList
          ref={listHandleRef}
          ariaLabel="Log entries"
          items={visible}
          getItemKey={(_line, index): number => keyOffset + index}
          estimateSize={(): number => ESTIMATED_LINE_HEIGHT_PX}
          renderItem={(line): ReactElement => <LogLineRow line={line} slots={slots} />}
          scrollContainerRef={registerVirtualScrollNode}
          // This component owns its own pin-not-yank logic above; opt out of message-list's built-in
          // tail-follow so the two don't both drive the scroll.
          followTail={false}
          className={slots.scroll()}
        />
      ) : (
        <div
          ref={scrollRef}
          role="log"
          aria-label="Log entries"
          aria-live="polite"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG 2.1.1 keyboard-scrollable overflow region — tabIndex=0 makes arrow/Page-key scrolling reachable without a mouse; not an accidental tab-stop.
          tabIndex={0} // eslint-disable-line jsx-a11y/no-noninteractive-tabindex -- same justification as the biome-ignore above
          onScroll={handleScroll}
          className={slots.scroll()}
          data-slot="log-viewer-scroll"
        >
          {visible.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only log tail (lines never reordered/removed from the middle) — position is a stable identity.
            <LogLineRow key={index} line={line} slots={slots} />
          ))}
        </div>
      )}
    </div>
  );
}
