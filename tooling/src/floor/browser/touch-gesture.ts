import type { Page } from "@playwright/test";

const SWIPE_MOVES = 10;
const SWIPE_MOVE_GAP_MS = 16;

/** Drive a native finger sequence; frame-spaced moves let the browser recognize a drag. */
export async function touchGesture(
  page: Page,
  start: { readonly x: number; readonly y: number },
  gesture: { readonly drag: { readonly dx: number; readonly dy: number } | null; readonly holdMs: number },
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    if (gesture.drag !== null) {
      for (let move = 1; move <= SWIPE_MOVES; move += 1) {
        // biome-ignore lint/suspicious/noPlaywrightWaitForTimeout: native move cadence is protocol input, not a readiness wait.
        await page.waitForTimeout(SWIPE_MOVE_GAP_MS);
        const x = start.x + (gesture.drag.dx * move) / SWIPE_MOVES;
        const y = start.y + (gesture.drag.dy * move) / SWIPE_MOVES;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      }
    }
    if (gesture.holdMs > 0) {
      // biome-ignore lint/suspicious/noPlaywrightWaitForTimeout: the requested long-press duration is protocol input, not a readiness wait.
      await page.waitForTimeout(gesture.holdMs);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}
