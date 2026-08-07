import type { ComponentProps, ReactElement } from "react";
import { layerVariants } from "./variants.ts";

/**
 * One-cell overlay stack (UI-Arch §4): every child occupies the SAME grid cell, so the box reserves the
 * WIDEST child instead of the SUM. The layout half of the row-reveal swap (`ROW_REVEAL_SWAP`,
 * client/components/row-reveal.ts): a rest-visible MARKER cluster and the hover-revealed ACTION cluster are
 * two paints of one strip, never two strips — side by side they charged the row for both while only ever
 * showing one, which is what starved the persona row's name column to 58px of 358 (side-eye 2026-08-06 P1).
 *
 * It is a GRID, not a `relative`/`absolute` pair, because absolute positioning takes the loser OUT of flow —
 * the cell would then size to whichever cluster stayed in flow and the other could overhang. It is also not a
 * `display` swap: both children stay in layout at all times, so the row's geometry is byte-identical at rest
 * and on hover (gate `no-hover-display-swap`; the reveal is `opacity`/`visibility` only).
 *
 * Usage: `<Layer className="shrink-0"><Row …/><Row …/></Layer>` — never `className="grid"` + a call-site
 * `[grid-area:…]` in feature code (structural layout goes through the layout kit).
 */
export function Layer({ className, ...props }: ComponentProps<"div">): ReactElement {
  return <div {...props} className={layerVariants({ className })} />;
}
