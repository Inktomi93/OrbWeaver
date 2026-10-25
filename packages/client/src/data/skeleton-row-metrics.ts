// Skeleton row metrics invert SkeletonRows' line layout using the same live CSS dimensions.
// Pointer arms, root scaling and owner-authored expressions resolve in the browser; non-DOM reads use generated base dimensions.

import { resolveCssLength } from "@orb/ui/lib";
import { LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";

// Resolve native CSS rather than decoding token serialization: pointer arms and owner CSS can compose functions.
function spacingPx(token: "size.control-lg" | "spacing.row" | "spacing.block"): number {
  return resolveCssLength(TOKENS[token].cssVar, LENGTH_BASE_PX[token]);
}

/** Nearest whole row count for a known box; a nonpositive pitch uses the caller's fallback. */
export function skeletonRowCountFor(boxHeight: number, fallback: number): number {
  const rowHeight = spacingPx("size.control-lg");
  const gap = spacingPx("spacing.row");
  const pad = spacingPx("spacing.block");
  if (rowHeight + gap <= 0) {
    return fallback;
  }
  return Math.max(1, Math.round((boxHeight - 2 * pad + gap) / (rowHeight + gap)));
}

/** The box `rows` `SkeletonRows shape="line"` rows occupy: the exact inverse of {@link skeletonRowCountFor}.
 *  Uses the generated authored-root dimensions when live CSS is unavailable. */
export function skeletonBoxFor(rows: number): number | null {
  const rowHeight = spacingPx("size.control-lg");
  const gap = spacingPx("spacing.row");
  const pad = spacingPx("spacing.block");
  return 2 * pad + rows * rowHeight + (rows - 1) * gap;
}
