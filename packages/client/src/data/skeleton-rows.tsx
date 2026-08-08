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

/** The placeholder shapes, homed ONCE as a tuple so the union DERIVES rather than re-spells its members
 *  (§5.5 dispatch discipline; `no-inline-union-redecl` — a two-member inline union slipped that gate, a
 *  third member does not). Module-private on purpose: callers spell the shape as a literal prop, so an
 *  exported tuple would be an orphan the liveness lens correctly flags. */
const SKELETON_ROW_SHAPES = ["line", "avatar-row", "datum"] as const;

export type SkeletonRowShape = (typeof SKELETON_ROW_SHAPES)[number];

export interface SkeletonRowsProps {
  /** How many placeholder rows to render. */
  readonly count: number;
  /**
   * `"line"` — one full-width bar per row (message/collection lists, pickers).
   * `"avatar-row"` — a leading circle + two stacked text lines (entity rows with an avatar/portrait).
   * `"datum"` — a `label · value` pair at TEXT line height, the readout's `DatumRow` anatomy.
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

  // A DATUM ROW IS TEXT, NOT A CONTROL (side-eye 2026-08-08 P2). The readout panels settle into
  // `DatumRow`s — one 17px text line per knob, `gap="tight"` — and were painting the `line` arm's
  // control-height bars while they waited: 4 × 40px + `gap="row"` + `padding="block"` = 233px of
  // placeholder that settled to 89px, a 144px collapse in the panel a skeleton exists to keep still.
  // So this arm mirrors `DatumRow`'s own box: a label bar and a shorter value bar on one text-height
  // line, stacked on `tight` with no block padding, because that is what the settled `Stack` is.
  // (It is deliberately OUTSIDE `skeleton-row-metrics.ts`'s arithmetic — that inverts the `line` arm's
  // control-height pitch for callers filling a reserved box, which is not what a datum panel does.)
  if (shape === "datum") {
    return (
      <Stack aria-busy={true} gap="tight">
        {rows.map((i) => (
          // The two bars are PROPORTIONAL, never fixed lengths (`no-raw-container-widths`): the label bar
          // takes the row and the value bar a quarter of it, so the pair reads as `label · value` at any
          // panel width instead of two stubs floating in a wide pane.
          <Row align="center" gap="row" key={i}>
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 shrink-0 basis-1/4" />
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
