// Visual baselines: --baseline saves, --diff compares via ffmpeg SSIM — a requested comparison that
// produced no evidence (no ffmpeg, no baseline) is RED, never a green skip.
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { artifactDir, print } from "../../_shared/artifacts.ts";
import { resolveFfmpeg } from "../../_shared/ffmpeg.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { Args, DiffOutcome } from "../contract/types.ts";
import { PNG_EXT_RE, SSIM_ALL_RE } from "../lib/out-names.ts";

// SSIM floor for --diff. 0.98 tolerates antialiasing wobble while catching any
// real layout/content change; tune per-surface later if flux demands.
const DIFF_SSIM_THRESHOLD = 0.98;

function compareSsim(ffmpeg: string, out: string, baselinePath: string): DiffOutcome {
  // SSIM via ffmpeg (no extra deps): stderr ends with "... All:0.9876 (…)".
  const ssimRes = runNicedSync(ffmpeg, ["-i", out, "-i", baselinePath, "-lavfi", "ssim", "-f", "null", "-"]);
  const ssimAll = SSIM_ALL_RE.exec(ssimRes.stderr)?.groups?.["all"];
  const ssim = ssimAll === undefined ? null : Number(ssimAll);
  // Difference heatmap — bright pixels = changed regions.
  const diffPng = out.replace(PNG_EXT_RE, "-diff.png");
  runNicedSync(ffmpeg, ["-y", "-i", out, "-i", baselinePath, "-filter_complex", "blend=all_mode=difference", diffPng]);
  const pass = ssim !== null && ssim >= DIFF_SSIM_THRESHOLD;
  print(`DIFF         ssim=${ssim ?? "unparseable"} (threshold ${DIFF_SSIM_THRESHOLD}) → ${pass ? "PASS" : "FAIL"}`);
  print(`diff heatmap ${diffPng}`);
  return {
    diffPairs: [
      ["diff", pass ? "PASS" : "FAIL"],
      ["ssim", ssim ?? "?"],
    ],
    ssimFailed: !pass,
  };
}

export async function runBaselineOrDiff(opts: Args, out: string, name: string): Promise<DiffOutcome> {
  const none: DiffOutcome = { diffPairs: [], ssimFailed: false };
  if (opts.baseline) {
    const baselinePath = join(await artifactDir("baselines"), `${name}.png`);
    await copyFile(out, baselinePath);
    print(`baseline     saved → ${baselinePath}`);
    return none;
  }
  if (!opts.diff) {
    return none;
  }
  const baselinePath = join(await artifactDir("baselines"), `${name}.png`);
  const ffmpeg = resolveFfmpeg();
  if (ffmpeg === null) {
    print("DIFF         skipped — ffmpeg not found (set FFMPEG_BIN or rebuild the dev container); SSIM unavailable");
    return { diffPairs: [["diff", "SKIPPED-NO-FFMPEG"]], ssimFailed: true };
  }
  if (!existsSync(baselinePath)) {
    print(`DIFF         no baseline at ${baselinePath} — run with --baseline first`);
    return { diffPairs: [["diff", "NO-BASELINE"]], ssimFailed: true };
  }
  return compareSsim(ffmpeg, out, baselinePath);
}
