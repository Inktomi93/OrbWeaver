// The browser's own text-size setting: Chromium's default font size, which a user sets in the browser's appearance
// settings. The page's `rem`, and the rem inside a media query, follow it; the app's own font-scale setting multiplies it.
import type { Page } from "@playwright/test";

export interface PlatformTextSize {
  readonly scale: number;
  /** The engine's default font size before the profile, read on the page's current document. */
  readonly defaultFontPx: number;
  readonly standardFontPx: number;
}

/**
 * Set the default font size of `page` to `scale` times the engine default, before its first navigation.
 *
 * @remarks The CDP session stays attached for the page's life: the override belongs to that session.
 * @throws When the engine has no Chrome DevTools Protocol, so no text-size door.
 */
export async function setPlatformTextSize(page: Page, scale: number): Promise<PlatformTextSize> {
  const defaultFontPx = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  const standardFontPx = defaultFontPx * scale;
  const session = await page.context().newCDPSession(page);
  await session.send("Page.enable");
  await session.send("Page.setFontSizes", { fontSizes: { standard: standardFontPx } });
  return { scale, defaultFontPx, standardFontPx };
}
