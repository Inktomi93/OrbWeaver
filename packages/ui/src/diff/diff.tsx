import type { Change } from "diff";
import { diffChars, diffLines, diffWords } from "diff";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { diffSegmentVariants } from "./variants";

// Axes declared ONCE as `as const` tuples, unions derived (§7.5 no-inline-union-redecl); both the
// tuple and the alias stay local (no-inline-types + useComponentExportOnlyModules) — consumers name
// mode via `DiffViewProps["mode"]`.
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
  /**
   * Diff granularity.
   * @defaultValue "chars"
   */
  readonly mode?: DiffMode;
  readonly className?: string;
}

/**
 * The jsdiff (`diff` v9) seal (ui-package-design §6.1 / D28/D54 — snapshot/edit-history diff
 * views; dep-cruiser `ui-satellite-seals` bans `diff` outside this dir). Renders the before→after
 * change stream as inline segments (skin in `variants.ts`).
 *
 * @example
 * ```tsx
 * <DiffView before={snapshot.text} after={draft.text} mode="words" />
 * ```
 */
export function DiffView({
  before,
  after,
  mode = "chars",
  className,
}: DiffViewProps): ReactElement {
  const changes = DIFF_BY_MODE[mode](before, after);
  const segments: ReactElement[] = [];
  // Keyed by the running text offset — positionally stable and unique (every change chunk is
  // non-empty), unlike an array index across recomputed diffs.
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
