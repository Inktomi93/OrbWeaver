// An attached CDP client can corrupt `window.screen` when it detaches. Reassert through the persistent
// owner connection with a forced viewport round trip; an attached connection cannot make it durable.
import type { Page } from "@playwright/test";
import type { Viewport } from "./argv.ts";

/** Reassert the owner's viewport through a guaranteed non-no-op round trip. */
export async function reassertOwnerViewport(page: Page, viewport: Viewport): Promise<void> {
  if (page.viewportSize() === null) {
    throw new Error("INSTRUMENT ERROR: reassertOwnerViewport called on a page this connection did not create");
  }
  const away: Viewport = { ...viewport, width: viewport.width === 1 ? 2 : viewport.width - 1 };
  await page.setViewportSize(away);
  await page.setViewportSize(viewport);
}
