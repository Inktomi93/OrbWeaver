// THE CONTAINMENT ANCHOR (#1765, closing the tautology #1754's regex-section lane found live —
// cb-regex-label, 697516da3): "does this element actually fit inside a REAL fixed-width box?"
//
// THE FAILURE THIS REPLACES. A `boundingBox()` comparison anchored at a BLOCK CONTAINER (a `<Stack>`/
// `<div>` with no `width`/`max-width` of its own) is tautological — the container's own box GROWS to wrap
// its overflowing content, so the "wrapper" being measured is never narrower than what it holds. Proven
// live: a "long preset name stays inside the 380px pane" pin against `[data-slot="regex-section"]` passed
// GREEN with `truncate` removed AND with `min-w-0` removed — both planted controls, both silently absorbed
// by the container's own growth. The fix is not a better matcher, it is a better ANCHOR: the wrapper must
// be a box whose width is fixed by something OTHER than the subject's own content (the story's mount root,
// a fixed-width pane, a token-capped column) — this helper never assumes the caller picked correctly, it
// PROVES the anchor is real by checking ancestry, and it measures BOTH `scrollWidth` (survives `overflow:
// hidden` hiding the excess) and `getBoundingClientRect().width` (the painted box) against the wrapper's
// `clientWidth`, because a `truncate` regression and a `min-w-0` regression fail on different sides of that
// pair — `truncate` alone leaves the painted box narrow but the text still measures wide via `scrollWidth`
// on the OVERFLOW-HIDDEN element, while dropping `min-w-0` on a flex ancestor lets the painted box itself
// grow past the wrapper.
//
// POLLED, never one-shot (`ct-no-oneshot-live-read-assert`): the subject can still be settling layout
// (a ResizeObserver, a late font swap) when the assertion first runs, and a single read would sample that
// transition instead of the settled state.

import { expect } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";

/** Sub-pixel tolerance, in CSS px — `getBoundingClientRect().width` can read up to ~1px over an integer
 *  `clientWidth` from browser subpixel layout rounding alone, with no real overflow behind it. */
const TOLERANCE_PX = 1;

export interface ContainmentOptions {
  /** `expect.poll` retry schedule — override only for a slower-settling subject. */
  readonly intervals?: readonly number[];
  /** `expect.poll`'s overall timeout, ms — override for a fixture proven to never settle (a negative
   *  control), so the failure surfaces on the SCHEDULE's own last interval instead of the default 5s. */
  readonly timeout?: number;
}

interface ContainmentReading {
  readonly scrollWidth: number;
  readonly boundingWidth: number;
  readonly wrapperClientWidth: number;
}

/**
 * Assert that `subject` fits horizontally inside `wrapper` — the SETTLED state, polled until both
 * `scrollWidth` and the painted box width stop exceeding the wrapper's `clientWidth`.
 *
 * REFUSES immediately (no poll, no retry) when `wrapper` is not an ancestor of `subject`: that relationship
 * is structural, not a layout transition, so a caller that picked the wrong anchor (e.g. a block container
 * that is a SIBLING of the real fixed-width box, or the subject's own parent) gets a named error instead of
 * a green pass that measured nothing real.
 */
export async function expectContainedWithin(subject: Locator, wrapper: Locator, options: ContainmentOptions = {}): Promise<void> {
  const wrapperHandle = await wrapper.elementHandle();
  if (wrapperHandle === null) {
    throw new Error("expectContainedWithin: the WRAPPER locator resolved to no element — mount it before asserting containment");
  }
  const isAncestor = await subject.evaluate((subjectEl: Element, wrapperEl: Element) => wrapperEl.contains(subjectEl), wrapperHandle);
  if (!isAncestor) {
    throw new Error(
      "expectContainedWithin: WRAPPER is not an ancestor of SUBJECT — pick a real fixed-width containing box (the story's mount root, a " +
        "token-capped column), never a block container that grows with its own content (that is the exact tautology #1765 exists to refuse)",
    );
  }

  const readOverflow = async (): Promise<string> => {
    const reading = await subject.evaluate((subjectEl: Element, wrapperEl: Element): ContainmentReading => {
      const rect = subjectEl.getBoundingClientRect();
      return { scrollWidth: subjectEl.scrollWidth, boundingWidth: rect.width, wrapperClientWidth: wrapperEl.clientWidth };
    }, wrapperHandle);
    return describeOverflow(reading);
  };

  const pollOptions: { intervals: number[]; timeout?: number } = { intervals: [...(options.intervals ?? [20, 50, 100, 250])] };
  if (options.timeout !== undefined) {
    pollOptions.timeout = options.timeout;
  }
  await expect
    .poll(readOverflow, pollOptions)
    // An empty string means "contained" — a mismatch surfaces the failing reading's OWN numbers (both
    // `scrollWidth` and the painted box width) in the poll's "Received" line, never a bare boolean.
    .toBe("");
}

function describeOverflow(reading: ContainmentReading): string {
  const { scrollWidth, boundingWidth, wrapperClientWidth } = reading;
  const overflowsScroll = scrollWidth > wrapperClientWidth + TOLERANCE_PX;
  const overflowsBox = boundingWidth > wrapperClientWidth + TOLERANCE_PX;
  if (!(overflowsScroll || overflowsBox)) {
    return "";
  }
  return `subject overflows wrapper: scrollWidth ${scrollWidth}px, boundingBox width ${boundingWidth.toFixed(1)}px, wrapper clientWidth ${wrapperClientWidth}px`;
}
