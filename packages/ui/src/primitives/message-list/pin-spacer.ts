// Pure pin-prompt spacer math (PD-147). `pin-prompt` scroll mode pins the just-sent message to the
// viewport TOP and holds it while the reply streams below. To let a SHORT reply still reach the top, the
// virtualizer needs extra scrollable height below the last real row (virtual-core `paddingEnd`) — otherwise
// the pinned row's start offset exceeds the max scroll and the row can't climb to the top. The spacer is
// only needed while the content BELOW the pin doesn't yet fill a viewport; once the reply grows past that,
// the pin sits at the top against real content and the spacer collapses to nothing.

/**
 * Whether a bottom spacer is still required to hold the pinned row at the viewport top: true until the
 * content below the pin fills at least one viewport. Equal heights count as filled (no spacer needed).
 */
export function pinSpacerActive(viewportHeightPx: number, contentBelowPinPx: number): boolean {
  return contentBelowPinPx < viewportHeightPx;
}
