// Render-determinism flag for visual probes: when localStorage["orb:probe-mode"] === "1" (seeded by
// `pnpm snap --probe` before navigation), surfaces showing wall-clock-relative text swap it for a fixed
// placeholder. Read once and cached — the flag is seeded pre-navigation and never flips live.

const PROBE_MODE_KEY = "orb:probe-mode";

let cached: boolean | null = null;

/** True when running under `pnpm snap --probe` (deterministic-render mode). */
export function isProbeMode(): boolean {
  if (cached === null) {
    try {
      cached = globalThis.localStorage.getItem(PROBE_MODE_KEY) === "1";
    } catch {
      cached = false;
    }
  }
  return cached;
}
