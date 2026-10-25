// SETTLE — waits for a data-backed surface to finish filling in after mount, by a lifecycle signal rather than a delay.

import type { Page } from "@playwright/test";

const QUIET_FRAMES = 20;

/** Settled means the DOM took no mutation for a run of animation frames. */
export async function settleSurface(page: Page): Promise<void> {
  await page.evaluate(
    (quietFrames: number) =>
      new Promise<void>((resolve) => {
        let quiet = 0;
        const observer = new MutationObserver(() => {
          quiet = 0;
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        const tick = (): void => {
          quiet += 1;
          if (quiet >= quietFrames) {
            observer.disconnect();
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    QUIET_FRAMES,
  );
}
