// The THEME-FALLBACK RING — the dev-only record of every fallback a ThemeScope reported: the D159 form-control edge fallback.
// The app shell's reporter logs it to the console, which a harness that cannot read the console never sees; this ring is the
// pull side `window.__orb.themeFallbacks()` reads. The reporter exists only in a dev build, so nothing is recorded in production.
import type { InputBorderFallback } from "@orb/ui/theme-scope";

const RING_CAP = 64;

interface ThemeFallbackRing {
  readonly inputBorder: readonly InputBorderFallback[];
  /** Entries evicted at the cap since load, so a full ring never reads as a complete history. */
  readonly dropped: number;
  readonly cap: number;
}

const inputBorder: InputBorderFallback[] = [];
let dropped = 0;

function push<T>(ring: T[], entry: T): void {
  ring.push(entry);
  if (ring.length > RING_CAP) {
    ring.shift();
    dropped += 1;
  }
}

export function recordInputBorderFallback(fallback: InputBorderFallback): void {
  push(inputBorder, fallback);
}

/** A copy of the ring and the drop tally. */
export function themeFallbackRing(): ThemeFallbackRing {
  return { inputBorder: [...inputBorder], dropped, cap: RING_CAP };
}
