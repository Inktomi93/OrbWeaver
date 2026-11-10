// The one fixed wait a browser case may hold. A case with a rendered witness waits on the witness; this window serves
// only what never renders, so the case keeps a positive control under the same wiring (Spine-Testing §3).
import type { Locator, Page } from "@playwright/test";

/** A scroll the window starts, and whose events restart it, so the window ends only after the scroller has stayed quiet. */
interface QuietScroll {
  readonly scroller: Locator;
  readonly byPx: number;
}

/**
 * Holds browser time for `windowMs` so an effect that would have happened has had its chance.
 * @param windowMs - the span the absence must hold, in milliseconds
 */
export async function absenceWindow(page: Page, windowMs: number, scroll?: QuietScroll): Promise<void> {
  if (scroll === undefined) {
    await page.evaluate((span) => new Promise<void>((resolve) => setTimeout(resolve, span)), windowMs);
    return;
  }
  await scroll.scroller.evaluate(
    (node, { span, byPx }) =>
      new Promise<void>((resolve) => {
        function settle(): void {
          node.removeEventListener("scroll", restart);
          resolve();
        }
        function restart(): void {
          clearTimeout(timer);
          timer = setTimeout(settle, span);
        }
        let timer = setTimeout(settle, span);
        node.addEventListener("scroll", restart);
        node.scrollTop += byPx;
      }),
    { span: windowMs, byPx: scroll.byPx },
  );
}
