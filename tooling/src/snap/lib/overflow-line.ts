// The `--expect-no-overflow` verdict: pure, so the two-arm decision is provable without a browser.
// The measurement half (and why there are two arms at all) is ops/overflow.ts.
import type { AssertionOutcome, OverflowProbe } from "../contract/types.ts";

/** The historical scroll-arm tolerance. Kept at 1px — this arm's calibration predates the rect sweep
 *  and nothing about adding a second arm makes its numbers wrong. */
const SCROLL_TOLERANCE_PX = 1;

/** Which SIDES the rect sweep judged, printed on every line, pass or fail: a reader owes the difference
 *  between "no child escapes" and "the sweep declined that side", and the #439 blindness is exactly what
 *  an unstated blind spot costs. Left/top are always present (no negative scroll offset exists); a
 *  missing right/bottom says that axis scrolls and the scroll delta above is its measure. */
function judgedLabel(probe: OverflowProbe): string {
  return probe.judged.join("+") || "none";
}

export function overflowAssertionLine(selector: string, probe: OverflowProbe): AssertionOutcome {
  const scrollFailed = probe.scrollX > SCROLL_TOLERANCE_PX || probe.scrollY > SCROLL_TOLERANCE_PX;
  const failed = scrollFailed || probe.escapes.length > 0;
  const detail = probe.escapes.map((exit) => `${exit.selector} exits ${exit.side} by ${exit.px}px`).join("; ");
  const head = `ASSERT no-overflow ${selector}: ${failed ? "FAIL" : "PASS"} overflow=${probe.scrollX}x${probe.scrollY} judged=${judgedLabel(probe)} escapes=${probe.escapes.length}`;
  return { line: detail === "" ? head : `${head} — ${detail}`, failed };
}
