// ffmpeg resolution for the probes that post-process pixels. Not guaranteed on PATH —
// consumers MUST handle null (skip ≠ fail: exit 0, SKIPPED result line).
// Playwright's bundled ffmpeg is NOT a fallback: screencast-only build, no ssim/blend filters.
import { spawnSync } from "node:child_process";
import process from "node:process";

let cached: string | null | undefined;

function runnable(bin: string): boolean {
  return spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0;
}

/**
 * The ffmpeg binary to spawn, or null when none is available. Order: `FFMPEG_BIN` env
 * override (must actually run) → `ffmpeg` on PATH → null. Cached per process.
 */
export function resolveFfmpeg(): string | null {
  if (cached !== undefined) {
    return cached;
  }
  // biome-ignore lint/style/noProcessEnv: FFMPEG_BIN is a probe-harness knob (which binary to spawn on a host where ffmpeg isn't on PATH) — ambient tooling env, not app config; probes run outside the foundation/env perimeter.
  const envBin = process.env["FFMPEG_BIN"];
  if (envBin !== undefined && envBin !== "" && runnable(envBin)) {
    cached = envBin;
    return cached;
  }
  cached = runnable("ffmpeg") ? "ffmpeg" : null;
  return cached;
}
