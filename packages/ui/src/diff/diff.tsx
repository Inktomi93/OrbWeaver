// Consumer: the refinery review surfaces (`DiffView` in accept-review.tsx and context-tabs.tsx) — the
// PREBUILT marker was deleted when the section it was sealed for (refinery/compare, D62 §4.1) landed,
// per the W6 contract (docs/architecture/history/Core-Enforcement-Deferred-Dropped.md §PREBUILT), the same self-cleaning shape
// SegmentedClock and Meter took.
import type { Change } from "diff";
import { diffChars, diffLines, diffWords } from "diff";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { diffSegmentVariants } from "./variants.ts";

const DIFF_MODES = ["chars", "words", "lines"] as const;
type DiffMode = (typeof DIFF_MODES)[number];
const SEGMENT_KINDS = ["added", "removed", "unchanged"] as const;
type SegmentKind = (typeof SEGMENT_KINDS)[number];

const DIFF_BY_MODE: Record<DiffMode, (before: string, after: string) => Change[]> = {
  chars: diffChars,
  words: diffWords,
  lines: diffLines,
};

function kindOf(change: Change): SegmentKind {
  if (change.added) {
    return "added";
  }
  if (change.removed) {
    return "removed";
  }
  return "unchanged";
}

export interface DiffViewProps {
  readonly before: string;
  readonly after: string;
  /** @defaultValue "chars" */
  readonly mode?: DiffMode;
  readonly className?: string;
}

/** The jsdiff seal — renders the before/after change stream as inline segments. */
export function DiffView({ before, after, mode = "chars", className }: DiffViewProps): ReactElement {
  const changes = DIFF_BY_MODE[mode](before, after);
  const segments: ReactElement[] = [];
  // Keyed by the running text offset — stable and unique, unlike an array index across recomputed diffs.
  let offset = 0;
  for (const change of changes) {
    const kind = kindOf(change);
    segments.push(
      <span key={offset} data-diff={kind} className={diffSegmentVariants({ kind })}>
        {change.value}
      </span>,
    );
    offset += change.value.length;
  }
  return <pre className={cn("whitespace-pre-wrap font-mono text-code leading-label-relaxed", className)}>{segments}</pre>;
}
