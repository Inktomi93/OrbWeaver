// PREBUILT[for:refinery/compare] — no current consumer; sealed for the refinery pipeline's
// stage-stepper "compare" sub-part (D62 §4.1; refinery is a declared-PLANNED section per
// client-architecture-lockdown.md §6a — build pending). Delete this marker (and re-check for
// consumers) if that plan is ever dropped instead of built.
import type { Change } from "diff";
import { diffChars, diffLines, diffWords } from "diff";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { diffSegmentVariants } from "./variants";

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
  return <pre className={cn("whitespace-pre-wrap font-mono text-code", className)}>{segments}</pre>;
}
