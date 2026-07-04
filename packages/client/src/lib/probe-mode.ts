// ── probe mode — render-determinism flag for visual probes ─────────────────
// When `localStorage["orb:probe-mode"] === "1"` (seeded by `pnpm snap --probe` BEFORE
// navigation — scripts/probes/snap.ts), surfaces that render WALL-CLOCK-RELATIVE text swap
// it for a fixed placeholder, so two snapshots of identical data are pixel-equal regardless
// of when they were taken. ("13h ago" churns every minute — the single biggest source of
// false positives in snapshot diffing.)
//
// Deliberately NOT an AppSettings/UserSettings tier (Spine-Config §"Settings / config"):
// this is probe-harness plumbing, not a user preference — same family as `orb:debug-token`.
// Read once and cached: the flag is seeded pre-navigation and never flips live.
//
// Barreled via lib/index.ts (orchestrator call, 2026-07-04): unlike the build-stripped dev-only
// modules (dev-tools, long-task-tracer), this SHIPS and is runtime-gated — same class as
// RenderProfiler/logClock — so features read it through the ONE `#lib` front door. Consumed only
// at render sites that show relative time.
//
// Animations are NOT handled here — `snap --probe` kills them harness-side with injected
// CSS; no app cooperation needed for motion.

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
