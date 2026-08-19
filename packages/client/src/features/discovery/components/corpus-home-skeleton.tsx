// THE CORPUS OVERVIEW'S LOADING STATE — the shape of the surface, not a sentence in a void.
//
// WHAT IT REPLACES (side-eye corpus re-pass 2026-08-19 §5, heuristic 1 scored 2/10): the CONTENT pane's one
// QueryBoundary fell back to a bare `Loading your corpus…` gloss line in the top-left corner of an 869x800
// empty rectangle, for the 1-2s its eight suspended reads take — while the LIST pane beside it ran proper
// skeletons the whole time. Two panes of one screen answering the same question in two registers, and the
// bigger one answering it with the register that teaches nothing about what is coming.
//
// IT MIRRORS THE SETTLED COMPOSITION, which is the only thing that makes a skeleton better than a spinner:
// masthead line + the `leadEarly` two-column band (focal island beside the readiness rail) + the tile shelf.
// The grid arm is the SAME `cols="leadEarly"` the settled surface uses, so the columns break at the same
// pane width and the reserved band does not re-flow the instant the data lands (a skeleton whose geometry
// disagrees with its settled state is a layout shift wearing a placeholder's clothes).
//
// `aria-busy` rides the root: `Skeleton` is decorative/aria-hidden by contract, so without it the whole
// region is silent to a screen reader for the entire wait.
//
// THE ISLAND IS A `Card`, not a hand-written box (train-debts, density-tier A1): the settled focal island
// is `<Card>` (corpus-family-map.tsx), which resolves BOTH its radius and its padding from the surface tier
// — a hand-spelled `rounded-card border p-block` claimed the elevated radius directly (D6: that step is the
// floating family's) and pinned a padding the tier owns. Composing the primitive makes the placeholder
// inherit whatever the settled island inherits, which is the only way the two can agree by construction.
//
// BAR WIDTHS ARE FRACTIONS OF THEIR OWN TRACK, never `w-32`/`w-48` (no-raw-container-widths): a shimmer bar
// stands in for text whose length scales with the column it sits in, and the in-tree skeleton idiom is
// fraction/`flex-1`/`w-full` throughout (packages/client/src/data/skeleton-rows.tsx, refinery's payload and
// rewrite lanes). A fixed rem width would hold still while the pane around it moved.

import { Card } from "@orb/ui/card";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import type { ReactElement } from "react";
import { SkeletonRows } from "#data";

/** The readiness rail's five pass rows — the one count on this surface that is FIXED (the stages tuple),
 *  so the placeholder can state it rather than guess. */
const READINESS_ROWS = 5;
/** Family plates in the island's grid while it loads. Two is the honest hedge: enough to read as a grid,
 *  few enough that a small library's settled island does not shrink under it. */
const ISLAND_PLATES = 2;
const GEM_TILES = 3;

/** `[0, 1, …]` — the placeholder's own row ids. Mapping the VALUES (rather than a `(_, i)` index) is the
 *  suppression-free spelling of a repeated decorative row, and it is `SkeletonRows`'s own. */
function slots(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

export function CorpusHomeSkeleton(): ReactElement {
  return (
    <Stack aria-busy={true} data-slot="corpus-home-skeleton" gap="section">
      <Stack gap="tight">
        <Skeleton className="h-3 w-1/6" />
        <Skeleton className="h-8 w-2/3" />
      </Stack>
      <Grid className="items-start" cols="leadEarly" gap="gutter">
        <Card className="min-w-0">
          <Stack gap="row">
            <Skeleton className="h-4 w-1/3" />
            {slots(ISLAND_PLATES).map((i) => (
              <Row align="center" gap="row" key={i}>
                <Skeleton className="size-10 rounded-base" />
                <Stack className="min-w-0 flex-1" gap="tight">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </Stack>
              </Row>
            ))}
          </Stack>
        </Card>
        <Stack className="min-w-0" gap="row">
          <Skeleton className="h-3 w-1/3" />
          <SkeletonRows count={READINESS_ROWS} shape="datum" />
        </Stack>
      </Grid>
      <Stack gap="row">
        <Skeleton className="h-3 w-1/5" />
        <Grid cols="auto" gap="row">
          {slots(GEM_TILES).map((i) => (
            <Row align="center" gap="row" key={i}>
              <Skeleton className="size-10 rounded-full" />
              <Stack className="min-w-0 flex-1" gap="tight">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-full" />
              </Stack>
            </Row>
          ))}
        </Grid>
      </Stack>
    </Stack>
  );
}
