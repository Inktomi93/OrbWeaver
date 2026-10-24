// The declared first-boot box for a keyed QueryBoundary (`reserveBlock`): a count of skeleton rows per
// width class, priced through the live spacing tokens. It applies only until this device has measured the
// surface; the settled height is data-dependent, so the counts approximate a typical library.

import { useMobileViewport } from "#state";
import { skeletonBoxFor } from "../data/skeleton-row-metrics.ts";

interface FirstBootRows {
  /** Skeleton rows the surface settles at on the desktop shell. */
  readonly wide: number;
  /** Skeleton rows the surface settles at under the mobile shell breakpoint. */
  readonly narrow: number;
}

/** The box for the current width class. `undefined` when the tokens cannot be resolved (no document), which
 *  leaves the boundary unreserved. */
export function useFirstBootBox(rows: FirstBootRows): number | undefined {
  const phone = useMobileViewport();
  return skeletonBoxFor(phone ? rows.narrow : rows.wide) ?? undefined;
}
