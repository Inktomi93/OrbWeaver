import type { ComponentProps, ReactElement } from "react";
import { useEffect, useRef } from "react";
import { cn } from "#lib";
import { highlightedTextVariants } from "./variants";

const slots = highlightedTextVariants();

export interface HighlightedTextRange {
  /** Inclusive start char offset. */
  readonly start: number;
  /** Exclusive end char offset. */
  readonly end: number;
}

export interface HighlightedTextProps extends Omit<ComponentProps<"div">, "children"> {
  readonly text: string;
  /**
   * `[start, end)` char-offset ranges to render as `<mark>`. Overlapping or adjacent ranges are
   * merged into one highlighted run before splitting — the simplest correct behavior for offsets
   * that touch or cross; there is no nested-highlight concept.
   */
  readonly ranges: readonly HighlightedTextRange[];
}

interface TextRun {
  readonly text: string;
  readonly highlighted: boolean;
}

function mergeRanges(
  text: string,
  ranges: readonly HighlightedTextRange[],
): HighlightedTextRange[] {
  const valid = ranges
    .map((range) => ({
      start: Math.max(0, Math.min(range.start, range.end)),
      end: Math.min(text.length, Math.max(range.start, range.end)),
    }))
    .filter((range) => range.start < range.end)
    .sort((a, b) => a.start - b.start);

  const merged: HighlightedTextRange[] = [];
  for (const range of valid) {
    const last = merged.at(-1);
    if (last !== undefined && range.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, range.end) };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function splitRuns(text: string, ranges: readonly HighlightedTextRange[]): TextRun[] {
  const merged = mergeRanges(text, ranges);
  if (merged.length === 0) {
    return [{ text, highlighted: false }];
  }

  const runs: TextRun[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) {
      runs.push({ text: text.slice(cursor, range.start), highlighted: false });
    }
    runs.push({ text: text.slice(range.start, range.end), highlighted: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    runs.push({ text: text.slice(cursor), highlighted: false });
  }
  return runs;
}

/**
 * HighlightedText — long plain text rendered with `[start, end)` char-offset ranges as real
 * `<mark>` elements (screen readers announce them; a `<span style="background">` would not).
 * Overlapping/adjacent ranges are merged into a single run before splitting (ui-primitive
 * carve-out work-order item 11) — the simplest correct behavior; there is no nested-highlight
 * concept. The first highlight scrolls into view on mount via `scrollIntoView({ block: "nearest"
 * })` — an instant jump, not an animated scroll, so there's nothing to gate behind
 * prefers-reduced-motion. Plain DOM/CSS; no windowing in v1 — a caller windowing a huge document
 * composes `@orb/ui/virtual-list` itself (no direct TanStack Virtual import here).
 *
 * Usage: `<HighlightedText text={doc} ranges={[{ start: 120, end: 148 }]} />`.
 */
export function HighlightedText({
  className,
  text,
  ranges,
  ...props
}: HighlightedTextProps): ReactElement {
  const firstMarkRef = useRef<HTMLElement | null>(null);
  const runs = splitRuns(text, ranges);
  const firstHighlightIndex = runs.findIndex((run) => run.highlighted);

  useEffect(() => {
    firstMarkRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div {...props} className={cn(slots.root(), className)} data-slot="highlighted-text-root">
      {runs.map((run, index) => {
        if (!run.highlighted) {
          // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional text segments derived fresh from text+ranges every render — there is no stabler identity.
          return <span key={index}>{run.text}</span>;
        }
        return (
          <mark
            // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional text segments derived fresh from text+ranges every render — there is no stabler identity.
            key={index}
            ref={index === firstHighlightIndex ? firstMarkRef : undefined}
            className={slots.mark()}
            data-slot="highlighted-text-mark"
          >
            {run.text}
          </mark>
        );
      })}
    </div>
  );
}
