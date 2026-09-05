// Unit: the message list's content-growth PREDICATES (#1602 extraction of the two `contentHeightPx` layout
// effects). Pure (node), imported DIRECTLY (relative) — the pin-spacer.test.ts precedent; the two hooks in
// the same module are exercised by `message-list.ct.tsx` in the browser, which is where an effect can be.
//
// WHAT MAKES THESE WORTH PINNING rather than reading: both encode a TIMING fact that the call site cannot
// show. `shouldRepinTail` has no "did it actually grow?" comparison — the effect runs on setup as well as on
// change, so its guard chain is the only thing between an effect setup and a scroll the reader did not ask
// for. `shouldSyncOnMount` is why an EMPTY list takes its first sync from the scroller's ResizeObserver
// rather than from mount. Both are stated at length in the module's header.

import { nextScrollportHeight, shouldRepinTail, shouldSyncOnMount } from "../../../../packages/ui/src/primitives/message-list/content-growth.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** A measured, laid-out, following list — the one arm that may re-pin. Each case flips ONE field. */
const REPINNABLE = { tailFollowActive: true, sticking: true, contentHeightPx: 1200, clientHeightPx: 600 } as const;

test("a measured, laid-out list whose reader is still following re-pins", () => {
  expect(shouldRepinTail(REPINNABLE)).toBe(true);
});

test("a reader who scrolled away is never marched back — the follow ref is the whole protection", () => {
  expect(shouldRepinTail({ ...REPINNABLE, sticking: false })).toBe(false);
});

test("pin-prompt / followTail:false take tail placement off entirely", () => {
  expect(shouldRepinTail({ ...REPINNABLE, tailFollowActive: false })).toBe(false);
});

test("an UNMEASURED list does not re-pin — there is no end to pin to yet", () => {
  expect(shouldRepinTail({ ...REPINNABLE, contentHeightPx: 0 })).toBe(false);
});

test("an unlaid-out scroller does not re-pin — the scroll would be a no-op that still records a write", () => {
  expect(shouldRepinTail({ ...REPINNABLE, clientHeightPx: 0 })).toBe(false);
});

// (a) in the module header: `getTotalSize()` is `paddingStart + paddingEnd` on an empty list, which is 0
// with no `blockPaddingToken` — so the mount path is skipped and the scroller's own observer runs the first
// sync. A list WITH block padding has a non-zero total while still empty and takes the mount path.
test("an empty, unpadded list does NOT sync at mount (the scroller's observer delivers the first one)", () => {
  expect(shouldSyncOnMount(0)).toBe(false);
});

test("any measured height — including one that is only the block padding — syncs at mount", () => {
  expect(shouldSyncOnMount(16)).toBe(true);
  expect(shouldSyncOnMount(1200)).toBe(true);
});

// The equality guard is why a streaming turn does not re-render the whole list through the scrollport path:
// a row growing changes the OL's height, never the scrollport's, so `sync()` runs and hands back the SAME
// number — and returning the identical value is what makes React's setState bail out.
test("an unchanged scrollport returns the PREVIOUS value identically (React bails out on it)", () => {
  expect(nextScrollportHeight(600, 600)).toBe(600);
});

test("a real container resize returns the new height", () => {
  expect(nextScrollportHeight(600, 480)).toBe(480);
});

test("the first measurement moves off zero", () => {
  expect(nextScrollportHeight(0, 600)).toBe(600);
});
