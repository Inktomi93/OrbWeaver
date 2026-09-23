// Pure pin-prompt spacer math. `pin-prompt` scroll mode pins the just-sent message to the
// viewport TOP and holds it while the reply streams below. To let a SHORT reply still reach the top, the
// virtualizer needs extra scrollable height below the last real row (virtual-core `paddingEnd`) — otherwise
// the pinned row's start offset exceeds the max scroll and the row can't climb to the top. The spacer is
// only needed while the content BELOW the pin doesn't yet fill a viewport; once the reply grows past that,
// the pin sits at the top against real content and the spacer collapses to nothing.

/**
 * Whether a bottom spacer is still required to hold the pinned row at the viewport top: true until the
 * content below the pin fills at least one viewport. Equal heights count as filled (no spacer needed).
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function pinSpacerActive(viewportHeightPx: number, contentBelowPinPx: number): boolean {
  return contentBelowPinPx < viewportHeightPx;
}

/** The rendered slice of the virtual window this decision reads — the two offsets and nothing else, so the
 *  math stays pure and message-list keeps the virtualizer to itself. */
export interface PinnedSpan {
  readonly start: number;
  readonly end: number;
}

/**
 * Has the pin done its job? True once the reply below the pinned row fills a viewport (the prompt now sits
 * at the top against real content), which is when the caller drops the pin and collapses the spacer — so
 * there is no trailing void. A pin that is not rendered right now, or no pin at all, is never collapsed:
 * an unrendered row's span is unknown, not zero.
 */
export function pinSpacerSpent(viewportHeightPx: number, pinned: PinnedSpan | undefined, last: PinnedSpan | undefined): boolean {
  return pinned !== undefined && last !== undefined && !pinSpacerActive(viewportHeightPx, last.end - pinned.start);
}
