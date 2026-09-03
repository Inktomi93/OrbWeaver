// The repair for #1287, PROVEN LIVE (not inferred): an ATTACHED sibling's own operations — measured with
// a bare `page.screenshot()` from a `connectOverCDP` client wrapping a page it did not create — silently
// re-issue Chromium's `Emulation.setDeviceMetricsOverride` for that target WITHOUT supplying
// `screenWidth`/`screenHeight` (Playwright has no local viewport record for a page it did not create, so
// it cannot round-trip the real values). `window.innerWidth/innerHeight` (the CSS viewport) survive
// because Chromium tracks that half at the target/frame level; `window.screen.width/height` reverts to
// Chromium's compiled headless default (800x600) the moment the CDP session that most recently wrote it
// detaches — measured true for EVERY session that writes it, including a repair issued FROM the sibling's
// own connection before it disconnects (a shorter-lived repair attempt that was tried and reverted, per
// the issue body — this file is the fix that actually survives, not that one).
//
// THE ONLY MECHANISM THAT STICKS, measured: the OWNER's own PERSISTENT connection (the one that never
// detaches for the life of the session/daemon) re-issues a REAL `page.setViewportSize()` round trip.
// "Real" matters: Playwright skips the underlying CDP call when the new size matches its own cached
// record, so simply calling `setViewportSize(sameSize)` is a silent no-op against an already-corrupted
// page — this steps the viewport away to a throwaway size first so the return call is a genuine second
// write, which is what makes Chromium re-derive `screenWidth`/`screenHeight` for the override instead of
// leaving them at the compiled default. Never call this against an ATTACHED session's own connection — an
// attached page has no local viewport record, so a "real" round trip there means the SAME kind of
// no-owner override this file exists to repair, and its effect vanishes the instant that sibling
// disconnects (measured: `tests/tooling/_shared/browser-attach.suite.int.test.ts`).
import type { Page } from "@playwright/test";
import type { Viewport } from "./argv.ts";

/** An arbitrary size distinct from any real viewport this repo launches at — its only job is to force a
 *  genuine second `Emulation.setDeviceMetricsOverride` write on the way back to the real size. */
const AWAY: Viewport = { width: 111, height: 222 };

/** Re-assert the OWNER's own viewport (and, as a side effect, its `screenWidth`/`screenHeight`) through a
 *  forced round trip on the page's PERSISTENT connection. Idempotent and cheap (two CDP round trips) —
 *  call it defensively on every call a stateful session serves; there is no way to observe from the
 *  daemon's socket protocol whether a sibling attached via `connectOverCDP` directly on the debugging
 *  endpoint since the last call, so "always repair" is the only sound trigger. Never call this on a page
 *  this connection did not create (`page.viewportSize() === null`) — that is the attached-session shape
 *  this fix exists to protect FROM, not repair through. */
export async function reassertOwnerViewport(page: Page, viewport: Viewport): Promise<void> {
  if (page.viewportSize() === null) {
    throw new Error("INSTRUMENT ERROR: reassertOwnerViewport called on a page this connection did not create");
  }
  await page.setViewportSize(AWAY);
  await page.setViewportSize(viewport);
}
