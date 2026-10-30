// The development logs for a ThemeScope's fallbacks. A D336 primary fallback is a theme's accent whose fill and solid
// steps share no ink, so the scope raised its hover and active knobs. A D159 form-control edge fallback is a carried
// background where the 3:1 floor or the focus-ring ceiling could not hold. The paint holds the floor either way; the
// logs say which theme cost depth.
import type { InputBorderFallback, ToneFallback } from "@orb/ui/theme-scope";
import { CONSOLE_STYLES, IS_DEV } from "#lib";

function logToneFallback({ accent, hover, active }: ToneFallback): void {
  console.warn(
    `%c[theme]%c accent ${accent} shares no ink with its solid steps; hover ${hover}%, active ${active}%`,
    CONSOLE_STYLES.warning,
    CONSOLE_STYLES.muted,
  );
}

function logInputBorderFallback({ edge, floorMet }: InputBorderFallback): void {
  console.warn(
    `%c[theme]%c form-control edge ${edge} ${floorMet ? "holds 3:1 but sits at or above the focus ring" : "could not reach 3:1 on every panel"}`,
    CONSOLE_STYLES.warning,
    CONSOLE_STYLES.muted,
  );
}

/** The reporter the app shell provides to every ThemeScope: the log in development, nothing in a production build. */
export const TONE_FALLBACK_REPORTER: ((fallback: ToneFallback) => void) | null = IS_DEV ? logToneFallback : null;

/** The D159 twin of {@link TONE_FALLBACK_REPORTER}, with the same development-only treatment. */
export const INPUT_BORDER_FALLBACK_REPORTER: ((fallback: InputBorderFallback) => void) | null = IS_DEV ? logInputBorderFallback : null;
