// The browser's own text-size setting: Chromium's default font size, which a user sets in the browser's appearance
// settings. The page's `rem`, and the rem inside a media query, follow it; the app's own font-scale setting multiplies it.
import { MEDIA_QUERIES, TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The text sizes a platform case runs at: the engine default, and the two enlarged steps a reader with low vision sets. */
export const PLATFORM_TEXT_SCALES = [1, 2, 3] as const;

/** The browser's text size on one page; disposing it puts the engine default back and closes its session. */
export interface PlatformTextSize extends AsyncDisposable {
  readonly scale: number;
  /** The engine's default font size before the profile, read on the page's current document. */
  readonly defaultFontPx: number;
  readonly standardFontPx: number;
}

/**
 * Set the default font size of `page` to `scale` times the engine default, before its first navigation. Hold the result
 * with `await using`.
 *
 * @remarks The override outlives the test on its page: the component-test runner reuses one page per worker, so a size
 * left in place reaches every later test there. Disposal restores the default.
 * @throws When the engine has no Chrome DevTools Protocol, so no text-size door.
 */
export async function setPlatformTextSize(page: Page, scale: number): Promise<PlatformTextSize> {
  const defaultFontPx = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  const standardFontPx = defaultFontPx * scale;
  const session = await page.context().newCDPSession(page);
  await session.send("Page.enable");
  await session.send("Page.setFontSizes", { fontSizes: { standard: standardFontPx } });
  return {
    scale,
    defaultFontPx,
    standardFontPx,
    [Symbol.asyncDispose]: async (): Promise<void> => {
      // A closed page took its session and its override with it.
      if (!page.isClosed()) {
        await session.send("Page.setFontSizes", { fontSizes: { standard: defaultFontPx } });
        await session.detach();
      }
    },
  };
}

/** The shell layout a viewport measures: the desktop shell or the phone shell. */
type ShellRegime = "desktop" | "mobile";

// The engine's own default font size, the `rem` that `setPlatformTextSize` scales. `expectShellRegime` re-reads the real breakpoint, so a wrong default fails there.
const ENGINE_DEFAULT_FONT_PX = 16;

/**
 * The shell a viewport of `viewportWidth` px measures at browser text size `textScale`. `shell.css` switches at the shell breakpoint,
 * a `rem` count, so enlarged browser text moves the breakpoint past a wide viewport: a 1280px viewport at 300% is the phone shell.
 * Name a cell by this regime, not by its width alone, and assert it with {@link expectShellRegime}.
 */
export function shellRegimeAt(viewportWidth: number, textScale: number): ShellRegime {
  const breakpointPx = Number.parseFloat(TOKENS["breakpoint.shell"].value) * ENGINE_DEFAULT_FONT_PX * textScale;
  return viewportWidth > breakpointPx ? "desktop" : "mobile";
}

/** Assert the mounted page resolves the shell a cell is named for. */
export async function expectShellRegime(page: Page, regime: ShellRegime): Promise<void> {
  expect(await page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["shell-desktop"])).toBe(regime === "desktop");
}
