// `--text-size`: the browser's own default font size, which a user sets in the browser's appearance settings. The page's
// `rem`, and the rem inside a media query, follow it; the app's own font-scale setting multiplies it. This is the
// `Page.setFontSizes` override the platform text-size helper (tests/support/browser/platform-text-size.ts) sends, applied
// to every page before it navigates and read back into the run's evidence.
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** The engine's own size: nothing is sent. */
export const NO_TEXT_SIZE = 1;

/** What a run's pages received: the asked multiple, the engine default read off the page, and the size set. */
export interface AppliedTextSize {
  readonly scale: number;
  readonly defaultFontPx: number;
  readonly standardFontPx: number;
}

/** The RESULT line's `text-size=` value: the multiple the pages received, so an enlarged run is told from a default one (`default`). */
export function textSizeResultValue(applied: AppliedTextSize | null): string {
  return applied === null ? "default" : `${String(applied.scale)}x`;
}

interface TextSizeCdp {
  // biome-ignore lint/style/useConsistentMethodSignatures: method syntax compares `params` bivariantly, which is what lets Playwright's generic `CDPSession.send` satisfy this.
  send(method: string, params?: object): Promise<unknown>;
}

/** The pages and CDP sessions the override goes through; a Playwright context satisfies it, and so does a recording stand-in. */
export interface TextSizeTarget<P> {
  readonly contexts: readonly {
    readonly context: { readonly pages: () => readonly P[]; readonly newCDPSession: (page: P) => Promise<TextSizeCdp> };
  }[];
}

const READ_DEFAULT_FONT_PX = "Number.parseFloat(getComputedStyle(document.documentElement).fontSize)";

/** Set every page's default font size to `scale` times the engine default and return what the pages received, or null
 *  when the run asked for the engine default. The CDP session is never detached, because Chromium drops the override
 *  with the session that set it. */
export async function applyTextSize<P extends { readonly evaluate: (expression: string) => Promise<unknown> }>(
  target: TextSizeTarget<P>,
  scale: number,
): Promise<AppliedTextSize | null> {
  if (scale === NO_TEXT_SIZE) {
    return null;
  }
  let applied: AppliedTextSize | null = null;
  for (const { context } of target.contexts) {
    for (const page of context.pages()) {
      const defaultFontPx = Number(await page.evaluate(READ_DEFAULT_FONT_PX));
      const standardFontPx = defaultFontPx * scale;
      const cdp = await context.newCDPSession(page);
      await cdp.send("Page.enable");
      await cdp.send("Page.setFontSizes", { fontSizes: { standard: standardFontPx } });
      applied = { scale, defaultFontPx, standardFontPx };
    }
  }
  return applied;
}
