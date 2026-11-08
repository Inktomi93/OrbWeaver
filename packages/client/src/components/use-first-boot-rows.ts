// The declared first-boot box for a keyed QueryBoundary (`reserveRows`): a count of skeleton rows per width
// class. It applies only until this device has measured the surface; the settled height is data-dependent,
// so the counts approximate a typical library.

import { useMobileViewport } from "#state";

interface FirstBootRows {
  /** Skeleton rows the surface settles at on the desktop shell. */
  readonly wide: number;
  /** Skeleton rows the surface settles at under the mobile shell breakpoint. */
  readonly narrow: number;
}

/** The row count for the current width class. */
export function useFirstBootRows(rows: FirstBootRows): number {
  const phone = useMobileViewport();
  return phone ? rows.narrow : rows.wide;
}
