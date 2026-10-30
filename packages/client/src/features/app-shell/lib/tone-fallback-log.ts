// The development log for a D336 primary fallback: a theme's accent whose fill and solid steps share no ink, so the
// scope raised its hover and active knobs. The paint still holds the floor; the log says which accent cost hover depth.
import type { ToneFallback } from "@orb/ui/theme-scope";
import { CONSOLE_STYLES, IS_DEV } from "#lib";

function logToneFallback({ accent, hover, active }: ToneFallback): void {
  console.warn(
    `%c[theme]%c accent ${accent} shares no ink with its solid steps; hover ${hover}%, active ${active}%`,
    CONSOLE_STYLES.warning,
    CONSOLE_STYLES.muted,
  );
}

/** The reporter the app shell provides to every ThemeScope: the log in development, nothing in a production build. */
export const TONE_FALLBACK_REPORTER: ((fallback: ToneFallback) => void) | null = IS_DEV ? logToneFallback : null;
