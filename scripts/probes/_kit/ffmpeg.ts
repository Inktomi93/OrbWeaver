// ffmpeg resolution for the probes that post-process pixels (snap --diff SSIM; record's
// gif/frame-strip renders in T6). The dev container ships WITHOUT ffmpeg until a Dockerfile
// rebuild lands, so consumers MUST handle null: degrade with a clear skipped-with-reason
// line, never crash — skip ≠ fail (the RESULT line says SKIPPED, the exit code stays 0).
// Playwright's bundled ffmpeg (~/.cache/ms-playwright/ffmpeg-*) is NOT a fallback: it is a
// screencast-only build with no ssim/blend filters (verified 2026-07-04).
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
