// Installation and deployment must reject a missing or unrunnable required media CLI, not trust file existence.
import { spawnSync } from "node:child_process";
import { ffmpegPath } from "node-av/ffmpeg";

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_MAX_BYTES = 65_536;
const VERSION_PREFIX = "ffmpeg version ";

/** Execute the package-relative CLI without PATH lookup or loading the native codec API. */
export function verifyMediaRuntime(): string {
  const result = spawnSync(ffmpegPath(), ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: PROBE_MAX_BYTES,
  });
  if (result.error !== undefined || result.status !== 0 || !result.stdout.startsWith(VERSION_PREFIX)) {
    throw new Error("The required packaged FFmpeg is not runnable. Reinstall server dependencies with node-av's build enabled.");
  }
  return result.stdout.split("\n", 1)[0] ?? "";
}
