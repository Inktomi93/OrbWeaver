// SkeletonRows (rollup-audit C2): the shared QueryBoundary loading fallback. `LoadingRows` (×3) +
// `PickerSkeleton` (×2 verbatim twins) + `LandingSkeleton` all hand-assemble a fixed count of
// `Skeleton` placeholders in one of two row shapes — this is the one home.
//
// The `line` arm's PITCH (row height + gap + the block padding) is inverted by
// `./skeleton-row-metrics.ts`, so a caller that knows the BOX it must fill can ask for the row count
// instead of guessing one (side-eye R-1). The two files change together.

import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import type { ReactElement } from "react";

export type SkeletonRowShape = "line" | "avatar-row";

export interface SkeletonRowsProps {
  /** How many placeholder rows to render. */
  readonly count: number;
  /**
   * `"line"` — one full-width bar per row (message/collection lists, pickers).
   * `"avatar-row"` — a leading circle + two stacked text lines (entity rows with an avatar/portrait).
   * @defaultValue "line"
   */
  readonly shape?: SkeletonRowShape;
}

/**
 * The suspense-free loading skeleton every `QueryBoundary` `fallback` renders — shape-matched
 * placeholders, never a spinner flash (UIP-309 / UI-Arch §4.3 rule 7).
 *
 * Usage: `fallback={<SkeletonRows count={5} shape="avatar-row" />}`
 */
export function SkeletonRows({ count, shape = "line" }: SkeletonRowsProps): ReactElement {
  const rows = Array.from({ length: count }, (_, i) => i);

  if (shape === "avatar-row") {
    return (
      <Stack aria-busy={true} gap="row" padding="block">
        {rows.map((i) => (
          <Row align="center" gap="row" key={i}>
            <Skeleton className="size-8 rounded-full" />
            <Stack className="min-w-0 flex-1" gap="field">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
            </Stack>
          </Row>
        ))}
      </Stack>
    );
  }

  return (
    <Stack aria-busy={true} gap="row" padding="block">
      {rows.map((i) => (
        <Skeleton className="h-control-lg w-full" key={i} />
      ))}
    </Stack>
  );
}
