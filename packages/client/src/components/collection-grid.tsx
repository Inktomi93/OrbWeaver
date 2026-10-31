// The collection grid template: a named list of tiles that auto-fits the pane it sits in.
// Each cell is a `listitem` layout wrapper, never the tile's own control: an interactive element given a
// non-interactive role misstates itself to assistive technology. The grid takes its host page's tier.

import { Grid, Stack } from "@orb/ui/layout";
import type { ComponentProps, Key, ReactElement, ReactNode } from "react";

type GridProps = ComponentProps<typeof Grid>;

/** The tracks a collection tiles on: a 16rem tile floor, a portrait shelf cell, or two wide halves. */
type CollectionCols = Extract<NonNullable<GridProps["cols"]>, "auto" | "cellShelf" | "pairWide">;

export interface CollectionGridProps<T> {
  /** The list's accessible name. */
  readonly label: string;
  readonly cols: CollectionCols;
  readonly gap: Extract<NonNullable<GridProps["gap"]>, "tight" | "row">;
  readonly items: readonly T[];
  readonly itemKey: (item: T) => Key;
  readonly renderItem: (item: T, index: number) => ReactNode;
}

/** A labelled list grid whose every cell is a `listitem`. */
export function CollectionGrid<T>({ label, cols, gap, items, itemKey, renderItem }: CollectionGridProps<T>): ReactElement {
  return (
    <Grid aria-label={label} cols={cols} gap={gap} role="list">
      {items.map((item, index) => (
        <Stack key={itemKey(item)} role="listitem">
          {renderItem(item, index)}
        </Stack>
      ))}
    </Grid>
  );
}
