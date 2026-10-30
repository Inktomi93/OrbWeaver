// The THEME-FALLBACK RING — the dev-only record of every fallback a ThemeScope reported: the D336 primary fallback and the
// D159 form-control edge fallback. The app shell's reporters log them to the console, which a harness that cannot read the
// console never sees; this ring is the pull side `window.__orb.themeFallbacks()` reads. Reporters exist only in a dev build,
// so nothing is recorded in production.
import type { InputBorderFallback, ToneFallback } from "@orb/ui/theme-scope";

const RING_CAP = 64;

interface ThemeFallbackRing {
  readonly tone: readonly ToneFallback[];
  readonly inputBorder: readonly InputBorderFallback[];
  /** Entries evicted at the cap since load, so a full ring never reads as a complete history. */
  readonly dropped: number;
  readonly cap: number;
}

const tone: ToneFallback[] = [];
const inputBorder: InputBorderFallback[] = [];
let dropped = 0;

function push<T>(ring: T[], entry: T): void {
  ring.push(entry);
  if (ring.length > RING_CAP) {
    ring.shift();
    dropped += 1;
  }
}

export function recordToneFallback(fallback: ToneFallback): void {
  push(tone, fallback);
}

export function recordInputBorderFallback(fallback: InputBorderFallback): void {
  push(inputBorder, fallback);
}

/** A copy of both rings and the drop tally. */
export function themeFallbackRing(): ThemeFallbackRing {
  return { tone: [...tone], inputBorder: [...inputBorder], dropped, cap: RING_CAP };
}
