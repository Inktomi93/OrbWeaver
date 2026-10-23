// Emulation the owner applied can be lost mid-run: an attached CDP client corrupts `window.screen` when it
// detaches, and Chromium drops the touch emulation a CDP session set when that session goes. Both reassert through the owner.
import type { Page } from "@playwright/test";
import type { Viewport } from "../instrument/argv.ts";
import { ownerPageSession } from "./browser-capture.ts";
import type { BrowserEnvironmentApplied } from "./browser-environment.ts";

/** The metrics the owner session emulates: Playwright's Chromium page sends these at context creation. */
export type OwnerMetrics = Pick<BrowserEnvironmentApplied, "viewport" | "screen" | "deviceScaleFactor" | "isMobile">;

/** Reassert the owner's viewport and screen through a guaranteed non-no-op round trip on the owner session.
 *
 *  Not `page.setViewportSize`: it also sets Playwright's emulated SCREEN to the viewport, and Playwright
 *  re-applies that state around every screenshot, so a phone's 430x932 screen read 430x740 on every
 *  session call after the first. The away step is what makes the repeat non-no-op. */
export async function reassertOwnerViewport(page: Page, applied: OwnerMetrics): Promise<void> {
  if (page.viewportSize() === null) {
    throw new Error("INSTRUMENT ERROR: reassertOwnerViewport called on a page this connection did not create");
  }
  const { viewport } = applied;
  const away: Viewport = { ...viewport, width: viewport.width === 1 ? 2 : viewport.width - 1 };
  await overrideOwnerViewport(page, applied, away);
  await overrideOwnerViewport(page, applied, viewport);
}

/** Emulate `size` as the viewport through the owner session, keeping the device's own screen. A caller that
 *  resizes for a capture (`--full`'s grow) uses this and ends on {@link reassertOwnerViewport}, so Playwright's
 *  own emulated size, and with it the screen it re-applies around a screenshot, is never touched. */
export async function overrideOwnerViewport(page: Page, applied: OwnerMetrics, size: Viewport): Promise<void> {
  const { viewport, screen } = applied;
  await ownerPageSession(page).send("Emulation.setDeviceMetricsOverride", {
    mobile: applied.isMobile,
    width: size.width,
    height: size.height,
    screenWidth: sameSize(viewport, screen) ? size.width : screen.width,
    screenHeight: sameSize(viewport, screen) ? size.height : screen.height,
    deviceScaleFactor: applied.deviceScaleFactor,
    screenOrientation: orientationOf(applied.isMobile, screen.width > screen.height),
  });
}

function sameSize(a: Viewport, b: Viewport): boolean {
  return a.width === b.width && a.height === b.height;
}

// Playwright's own mapping: a mobile context reports portrait unless its screen is wider than tall.
function orientationOf(isMobile: boolean, landscape: boolean): { readonly angle: number; readonly type: "landscapePrimary" | "portraitPrimary" } {
  if (isMobile && !landscape) {
    return { angle: 0, type: "portraitPrimary" };
  }
  return isMobile ? { angle: 90, type: "landscapePrimary" } : { angle: 0, type: "landscapePrimary" };
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
