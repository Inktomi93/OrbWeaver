// Emulation the owner applied can be lost mid-run: an attached CDP client corrupts `window.screen` when it
// detaches, and a clipped screenshot (an element shot) drops touch emulation. Both reassert through the owner.
import type { Page } from "@playwright/test";
import type { Viewport } from "./argv.ts";
import { ownerPageSession } from "./browser-capture.ts";
import type { BrowserEnvironmentApplied } from "./browser-environment.ts";

/** Reassert the owner's viewport through a guaranteed non-no-op round trip. */
export async function reassertOwnerViewport(page: Page, viewport: Viewport): Promise<void> {
  if (page.viewportSize() === null) {
    throw new Error("INSTRUMENT ERROR: reassertOwnerViewport called on a page this connection did not create");
  }
  const away: Viewport = { ...viewport, width: viewport.width === 1 ? 2 : viewport.width - 1 };
  await page.setViewportSize(away);
  await page.setViewportSize(viewport);
}

/** Reassert the owner's touch emulation through the page's persistent owner session, with the call the
 *  launcher's own context makes, so `(pointer: coarse)` and `maxTouchPoints` read the device again. A
 *  desktop device applied no touch emulation and has none to restore. */
export async function reassertOwnerDevice(page: Page, applied: Pick<BrowserEnvironmentApplied, "hasTouch">): Promise<void> {
  const cdp = ownerPageSession(page);
  if (applied.hasTouch) {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  }
}
