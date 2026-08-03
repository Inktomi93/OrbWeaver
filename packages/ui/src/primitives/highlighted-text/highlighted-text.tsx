import type { ComponentProps, ReactElement } from "react";
import { useEffect, useRef } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { highlightedTextVariants } from "./variants.ts";

export interface HighlightedTextRange {
  /** Inclusive start char offset. */
  readonly start: number;
  /** Exclusive end char offset. */
  readonly end: number;
}

export interface HighlightedTextProps extends Omit<ComponentProps<"div">, "children">, VariantProps<typeof highlightedTextVariants> {
  readonly text: string;
  /** `[start, end)` char-offset ranges to render as `<mark>`. Overlapping/adjacent ranges are merged before splitting. */
  readonly ranges: readonly HighlightedTextRange[];
}

interface TextRun {
  readonly text: string;
  readonly highlighted: boolean;
}

function mergeRanges(text: string, ranges: readonly HighlightedTextRange[]): HighlightedTextRange[] {
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
 * Long plain text rendered with char-offset ranges as real `<mark>` elements (screen readers
 * announce them; a styled `<span>` would not). The first highlight scrolls into view instantly on
 * mount and whenever `ranges` genuinely changes value.
 *
 * `skin="code"` renders the runs as machine text (mono, micro, muted) — the resolved-template readout —
 * instead of the default body-voice prose.
 */
export function HighlightedText({ className, text, ranges, skin, ...props }: HighlightedTextProps): ReactElement {
  const slots = highlightedTextVariants({ skin });
  const firstMarkRef = useRef<HTMLElement | null>(null);
  const runs = splitRuns(text, ranges);
  const firstHighlightIndex = runs.findIndex((run) => run.highlighted);

  // Content, not identity: a fresh `ranges` array with the same start/end pairs must not re-trigger the scroll.
  const rangesSignature = ranges.map((range) => `${range.start}-${range.end}`).join(",");
  const previousRangesSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousRangesSignatureRef.current === rangesSignature) {
      return;
    }
    previousRangesSignatureRef.current = rangesSignature;
    firstMarkRef.current?.scrollIntoView({ block: "nearest" });
  }, [rangesSignature]);

  return (
    <div {...props} className={cn(slots.root(), className)} data-slot="highlighted-text-root">
      {runs.map((run, index) => {
        if (!run.highlighted) {
          // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional text segments derived fresh from text+ranges every render — no stabler identity exists.
          return <span key={index}>{run.text}</span>;
        }
        return (
          <mark
            // biome-ignore lint/suspicious/noArrayIndexKey: runs are positional text segments derived fresh from text+ranges every render — no stabler identity exists.
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
