import type { ComponentProps, ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { gridVariants } from "./variants.ts";

export interface GridProps extends ComponentProps<"div">, VariantProps<typeof gridVariants> {}

/**
 * Responsive auto-fit grid on the intent-token gap scale (UI-Arch §4). Children tile into as many
 * columns as fit at the column-min width (`cols="auto"` 16rem · `cols="wide"` 22rem) and reflow down to
 * one as space shrinks — so a settings-style pane FILLS its width and adding/removing/reordering items
 * needs no fixed column count.
 *
 * Usage: `<Grid cols="wide" gap="section">…</Grid>` — never `className="grid grid-cols-2"` in feature
 * code (structural layout goes through the layout kit; the track template lives in variants.ts).
 */
export function Grid({ className, gap, cols, ...props }: GridProps): ReactElement {
  return <div {...props} className={gridVariants({ gap, cols, className })} />;
}
